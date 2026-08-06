package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"time"
)

// stdout and stderr each retain only their last 32 KiB, so no call can inject
// more than roughly 64 KiB of command diagnostics into the MCP response.
const maxCommandOutput = 32 << 10
const processSettleTimeout = 2 * time.Second
const outputSettleTimeout = 500 * time.Millisecond

type CommandResult struct {
	OK        bool   `json:"ok"`
	ExitCode  int    `json:"exitCode"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	Truncated bool   `json:"truncated"`
	Failure   string `json:"failure,omitempty"`
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

// processCapture owns the parent side of stdout/stderr pipes. Using explicit
// pipes keeps exec.Cmd.Wait independent from inherited descriptors, so a
// detached descendant cannot hold the MCP call open forever.
type processCapture struct {
	stdout, stderr           *cappedBuffer
	stdoutRead, stderrRead   *os.File
	stdoutWrite, stderrWrite *os.File
	stdoutDone, stderrDone   chan struct{}
}

func attachProcessCapture(cmd *exec.Cmd) (*processCapture, error) {
	stdoutRead, stdoutWrite, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	stderrRead, stderrWrite, err := os.Pipe()
	if err != nil {
		_ = stdoutRead.Close()
		_ = stdoutWrite.Close()
		return nil, err
	}
	capture := &processCapture{
		stdout: &cappedBuffer{}, stderr: &cappedBuffer{},
		stdoutRead: stdoutRead, stdoutWrite: stdoutWrite,
		stderrRead: stderrRead, stderrWrite: stderrWrite,
		stdoutDone: make(chan struct{}), stderrDone: make(chan struct{}),
	}
	cmd.Stdout, cmd.Stderr = stdoutWrite, stderrWrite
	go func() {
		_, _ = io.Copy(capture.stdout, stdoutRead)
		close(capture.stdoutDone)
	}()
	go func() {
		_, _ = io.Copy(capture.stderr, stderrRead)
		close(capture.stderrDone)
	}()
	return capture, nil
}

func (c *processCapture) closeChildEnds() {
	_ = c.stdoutWrite.Close()
	_ = c.stderrWrite.Close()
}

func (c *processCapture) closeAll() {
	c.closeChildEnds()
	_ = c.stdoutRead.Close()
	_ = c.stderrRead.Close()
}

func (c *processCapture) awaitEOF(timeout time.Duration) bool {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	stdoutDone, stderrDone := c.stdoutDone, c.stderrDone
	for stdoutDone != nil || stderrDone != nil {
		select {
		case <-stdoutDone:
			stdoutDone = nil
		case <-stderrDone:
			stderrDone = nil
		case <-timer.C:
			return false
		}
	}
	_ = c.stdoutRead.Close()
	_ = c.stderrRead.Close()
	return true
}

func (c *processCapture) forceCloseAndJoin() {
	c.closeAll()
	// Closing the read descriptors releases the local copy goroutines. This is
	// bounded defensively; returning must never depend on a descendant process.
	_ = c.awaitEOF(250 * time.Millisecond)
}

func finalizeCommandResult(err error, capture *processCapture, failure, diagnostic string) CommandResult {
	if diagnostic != "" {
		_, _ = capture.stderr.Write([]byte("\n" + diagnostic))
	}
	if capture.stdout.truncated || capture.stderr.truncated {
		if failure == "" {
			failure = "output_limit_exceeded"
		}
		_, _ = capture.stderr.Write([]byte("\ncommand output exceeded the 32 KiB per-stream limit; result rejected"))
	}
	truncated := capture.stdout.truncated || capture.stderr.truncated
	return CommandResult{
		OK:        err == nil && failure == "" && !truncated,
		ExitCode:  exitCode(err),
		Stdout:    string(capture.stdout.data),
		Stderr:    string(capture.stderr.data),
		Truncated: truncated,
		Failure:   failure,
	}
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
		if !errors.Is(err, os.ErrNotExist) {
			status.State = "unhealthy"
		}
		status.Reason = err.Error()
		return status
	}
	launcher = validated
	fingerprint, err := launcherFingerprint(launcher)
	if err != nil {
		status.State, status.Reason = "unhealthy", fmt.Sprintf("fingerprint managed runtime launcher: %v", err)
		return status
	}
	version := runRuntimeCommand(ctx, launcher, []string{"--version"})
	if err := verifyLauncherFingerprint(c, fingerprint); err != nil {
		status.State, status.Reason = "unhealthy", err.Error()
		return status
	}
	doctor := runRuntimeCommand(ctx, launcher, []string{"doctor", "--json"})
	if err := verifyLauncherFingerprint(c, fingerprint); err != nil {
		status.State, status.Reason = "unhealthy", err.Error()
		return status
	}
	status.RuntimeVersion = extractStrictSemver(version.Stdout + " " + version.Stderr)
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
	a, okA := parseSemver(actual)
	m, okM := parseSemver(minimum)
	if !okA || !okM {
		return false
	}
	for i := range a.core {
		if a.core[i] != m.core[i] {
			return a.core[i] > m.core[i]
		}
	}
	return comparePrerelease(a.prerelease, m.prerelease) >= 0
}

type semanticVersion struct {
	core       [3]uint64
	prerelease []string
}

func parseSemver(value string) (semanticVersion, bool) {
	var parsed semanticVersion
	if value == "" || strings.TrimSpace(value) != value {
		return parsed, false
	}
	withoutBuild := value
	if index := strings.IndexByte(withoutBuild, '+'); index >= 0 {
		build := withoutBuild[index+1:]
		if !validSemverIdentifiers(build, false) {
			return parsed, false
		}
		withoutBuild = withoutBuild[:index]
	}
	coreText := withoutBuild
	if index := strings.IndexByte(coreText, '-'); index >= 0 {
		prerelease := coreText[index+1:]
		if !validSemverIdentifiers(prerelease, true) {
			return parsed, false
		}
		parsed.prerelease = strings.Split(prerelease, ".")
		coreText = coreText[:index]
	}
	parts := strings.Split(coreText, ".")
	if len(parts) != 3 {
		return parsed, false
	}
	for i, part := range parts {
		if part == "" || (len(part) > 1 && part[0] == '0') {
			return parsed, false
		}
		value, err := strconv.ParseUint(part, 10, 64)
		if err != nil {
			return parsed, false
		}
		parsed.core[i] = value
	}
	return parsed, true
}

func validSemverIdentifiers(value string, rejectNumericLeadingZero bool) bool {
	if value == "" {
		return false
	}
	for _, identifier := range strings.Split(value, ".") {
		if identifier == "" {
			return false
		}
		numeric := true
		for _, character := range identifier {
			if !((character >= '0' && character <= '9') || (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z') || character == '-') {
				return false
			}
			if character < '0' || character > '9' {
				numeric = false
			}
		}
		if rejectNumericLeadingZero && numeric && len(identifier) > 1 && identifier[0] == '0' {
			return false
		}
	}
	return true
}

func comparePrerelease(actual, minimum []string) int {
	if len(actual) == 0 && len(minimum) == 0 {
		return 0
	}
	if len(actual) == 0 {
		return 1
	}
	if len(minimum) == 0 {
		return -1
	}
	for i := 0; i < len(actual) && i < len(minimum); i++ {
		aNumber, aErr := strconv.ParseUint(actual[i], 10, 64)
		mNumber, mErr := strconv.ParseUint(minimum[i], 10, 64)
		switch {
		case aErr == nil && mErr == nil && aNumber != mNumber:
			if aNumber > mNumber {
				return 1
			}
			return -1
		case aErr == nil && mErr != nil:
			return -1
		case aErr != nil && mErr == nil:
			return 1
		case actual[i] > minimum[i]:
			return 1
		case actual[i] < minimum[i]:
			return -1
		}
	}
	if len(actual) > len(minimum) {
		return 1
	}
	if len(actual) < len(minimum) {
		return -1
	}
	return 0
}

func extractStrictSemver(output string) string {
	for _, field := range strings.Fields(output) {
		candidate := strings.TrimPrefix(field, "v")
		candidate = strings.Trim(candidate, "()[]{}:,;")
		if _, ok := parseSemver(candidate); ok {
			return candidate
		}
	}
	return ""
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
			haveValue, exists := have[key]
			if !exists || !capabilitySubset(haveValue, value) {
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
		if actual == nil || required == nil || reflect.TypeOf(actual) != reflect.TypeOf(required) {
			return actual == nil && required == nil
		}
		return reflect.DeepEqual(actual, required)
	}
}

type managedLauncherFingerprint struct {
	Path   string
	SHA256 string
	Size   int64
}

func launcherFingerprint(path string) (managedLauncherFingerprint, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return managedLauncherFingerprint{}, err
	}
	digest, err := fileSHA256(path)
	if err != nil {
		return managedLauncherFingerprint{}, err
	}
	return managedLauncherFingerprint{Path: filepath.Clean(path), SHA256: digest, Size: info.Size()}, nil
}

func verifyLauncherFingerprint(c Contract, expected managedLauncherFingerprint) error {
	path, err := validateManagedLauncher(c)
	if err != nil {
		return fmt.Errorf("managed runtime launcher became invalid: %w", err)
	}
	actual, err := launcherFingerprint(path)
	if err != nil {
		return fmt.Errorf("managed runtime launcher fingerprint failed: %w", err)
	}
	if actual != expected {
		return fmt.Errorf("managed runtime launcher changed during health check; runtime is unhealthy")
	}
	return nil
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
