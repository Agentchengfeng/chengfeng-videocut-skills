package bootstrap

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// stdout and stderr each retain only their last 32 KiB, so no call can inject
// more than roughly 64 KiB of command diagnostics into the MCP response.
const maxCommandOutput = 32 << 10

var versionPattern = regexp.MustCompile(`(?:^|[^0-9])v?([0-9]+\.[0-9]+\.[0-9]+)(?:$|[^0-9])`)

type CommandResult struct {
	OK        bool   `json:"ok"`
	ExitCode  int    `json:"exitCode"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	Truncated bool   `json:"truncated"`
}

type cappedBuffer struct {
	data      []byte
	truncated bool
}

func (w *cappedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if n >= maxCommandOutput {
		w.data = append(w.data[:0], p[n-maxCommandOutput:]...)
		w.truncated = true
		return n, nil
	}
	if len(w.data)+n > maxCommandOutput {
		drop := len(w.data) + n - maxCommandOutput
		copy(w.data, w.data[drop:])
		w.data = w.data[:len(w.data)-drop]
		w.truncated = true
	}
	w.data = append(w.data, p...)
	return n, nil
}

func runRuntimeCommand(ctx context.Context, launcher string, args []string) CommandResult {
	cmd, err := platformCommand(launcher, args)
	if err != nil {
		return CommandResult{ExitCode: -1, Stderr: err.Error()}
	}
	cmd.Dir = filepath.Dir(launcher)
	return runProcessTree(ctx, cmd, 90*time.Second)
}

func validateArgv(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("argv must contain at least one argument")
	}
	if len(args) > 128 {
		return fmt.Errorf("argv exceeds 128 arguments")
	}
	for i, arg := range args {
		if len(arg) > 32*1024 || strings.ContainsAny(arg, "\x00\r\n") {
			return fmt.Errorf("argv[%d] contains unsupported data", i)
		}
	}
	return nil
}

type RuntimeStatus struct {
	State           string                `json:"state"`
	Ready           bool                  `json:"ready"`
	RuntimeVersion  string                `json:"runtimeVersion,omitempty"`
	RequiredVersion string                `json:"requiredVersion"`
	Platform        string                `json:"platform"`
	TargetRoot      string                `json:"targetRoot"`
	Launcher        string                `json:"launcher"`
	Doctor          map[string]any        `json:"doctor,omitempty"`
	Compatibility   *RuntimeCompatibility `json:"compatibility,omitempty"`
	Reason          string                `json:"reason,omitempty"`
}

type RuntimeCompatibility struct {
	VersionCompatible    bool `json:"versionCompatible"`
	CapabilityCompatible bool `json:"capabilityCompatible"`
}

func inspectRuntime(ctx context.Context, c Contract) RuntimeStatus {
	root, _ := runtimeRoot(c)
	launcher, err := launcherPath(c)
	status := RuntimeStatus{State: "missing", RequiredVersion: c.MinimumRuntimeVersion, Platform: platformKey(), TargetRoot: root, Launcher: launcher}
	if err != nil {
		status.State, status.Reason = "unsupported", err.Error()
		return status
	}
	validated, err := validateManagedLauncher(c)
	if err != nil {
		status.Reason = err.Error()
		return status
	}
	launcher = validated
	version := runRuntimeCommand(ctx, launcher, []string{"--version"})
	doctor := runRuntimeCommand(ctx, launcher, []string{"doctor", "--json"})
	match := versionPattern.FindStringSubmatch(strings.TrimSpace(version.Stdout + " " + version.Stderr))
	if len(match) > 1 {
		status.RuntimeVersion = match[1]
	}
	if parsed := lastJSONObject(doctor.Stdout); parsed != nil {
		status.Doctor = parsed
	}
	healthy := doctor.OK && boolPath(status.Doctor, "ok") && boolPath(status.Doctor, "data", "healthy")
	versionCompatible := semverAtLeast(status.RuntimeVersion, c.MinimumRuntimeVersion)
	capabilityCompatible := supportsCapabilities(status.Doctor, c.Capabilities)
	if healthy {
		status.Compatibility = &RuntimeCompatibility{VersionCompatible: versionCompatible, CapabilityCompatible: capabilityCompatible}
	}
	if version.OK && healthy && versionCompatible && capabilityCompatible {
		status.State, status.Ready = "ready", true
		return status
	}
	if version.OK && healthy {
		status.State = "incompatible"
	} else {
		status.State = "unhealthy"
	}
	status.Reason = strings.TrimSpace(version.Stderr + " " + doctor.Stderr)
	if status.Reason == "" {
		if healthy {
			status.Reason = "runtime version or capability contract is incompatible"
		} else {
			status.Reason = "version or doctor check failed"
		}
	}
	return status
}

func semverAtLeast(actual, minimum string) bool {
	parse := func(value string) ([3]int, bool) {
		var out [3]int
		if _, err := fmt.Sscanf(strings.SplitN(value, "-", 2)[0], "%d.%d.%d", &out[0], &out[1], &out[2]); err != nil {
			return out, false
		}
		return out, true
	}
	a, okA := parse(actual)
	m, okM := parse(minimum)
	if !okA || !okM {
		return false
	}
	for i := range a {
		if a[i] != m[i] {
			return a[i] > m[i]
		}
	}
	return !strings.Contains(actual, "-") || strings.Contains(minimum, "-")
}

func supportsCapabilities(doctor map[string]any, required map[string]any) bool {
	data, ok := doctor["data"].(map[string]any)
	if !ok {
		return false
	}
	actual, ok := data["capabilities"].(map[string]any)
	if !ok {
		return false
	}
	return capabilitySubset(actual, required)
}

// capabilitySubset is deliberately schema-agnostic: every required scalar is
// exact, every required object key must recursively match, and required arrays
// are subsets. New contracts such as durableJobsApiVersion/durableJobKinds are
// therefore enforced as soon as they appear in runtime-requirements.json.
func capabilitySubset(actual, required any) bool {
	switch wanted := required.(type) {
	case map[string]any:
		have, ok := actual.(map[string]any)
		if !ok {
			return false
		}
		for key, value := range wanted {
			if !capabilitySubset(have[key], value) {
				return false
			}
		}
		return true
	case []any:
		have, ok := actual.([]any)
		if !ok {
			return false
		}
		for _, requiredItem := range wanted {
			found := false
			for _, actualItem := range have {
				if capabilitySubset(actualItem, requiredItem) {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	default:
		return fmt.Sprint(actual) == fmt.Sprint(required)
	}
}

func lastJSONObject(text string) map[string]any {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		var value map[string]any
		if json.Unmarshal([]byte(strings.TrimSpace(lines[i])), &value) == nil {
			return value
		}
	}
	return nil
}

func boolPath(value map[string]any, path ...string) bool {
	var current any = value
	for _, key := range path {
		m, ok := current.(map[string]any)
		if !ok {
			return false
		}
		current = m[key]
	}
	b, _ := current.(bool)
	return b
}
