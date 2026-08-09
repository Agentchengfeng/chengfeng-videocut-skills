// codex-plugin-discovery-smoke verifies the real Codex 0.146 Plugin surface in
// an isolated CODEX_HOME. It never reads or mutates the user's Plugin state.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const pluginID = "chengfeng-videocut-local-development@chengfeng-videocut-local-development"

type pluginList struct {
	Installed []pluginRow `json:"installed"`
	Available []pluginRow `json:"available"`
}

type pluginRow struct {
	PluginID        string `json:"pluginId"`
	Version         string `json:"version"`
	Installed       bool   `json:"installed"`
	Enabled         bool   `json:"enabled"`
	MarketplaceName string `json:"marketplaceName"`
}

func main() {
	if len(os.Args) != 3 {
		fatal(fmt.Errorf("usage: codex-plugin-discovery-smoke /absolute/path/to/codex /absolute/marketplace/root"))
	}
	codexPath, marketplaceRoot := os.Args[1], os.Args[2]
	if !filepath.IsAbs(codexPath) || !filepath.IsAbs(marketplaceRoot) {
		fatal(fmt.Errorf("codex and marketplace paths must be absolute"))
	}
	isolatedHome, err := os.MkdirTemp("", "codex-plugin-discovery-")
	if err != nil {
		fatal(err)
	}
	defer os.RemoveAll(isolatedHome)

	version := strings.TrimSpace(run(codexPath, isolatedHome, "--version"))
	if version != "codex-cli 0.146.0" {
		fatal(fmt.Errorf("Codex version=%q, want codex-cli 0.146.0", version))
	}
	var added struct {
		MarketplaceName string `json:"marketplaceName"`
		InstalledRoot   string `json:"installedRoot"`
	}
	decode(run(codexPath, isolatedHome, "plugin", "marketplace", "add", marketplaceRoot, "--json"), &added)
	if added.MarketplaceName != "chengfeng-videocut-local-development" || filepath.Clean(added.InstalledRoot) != filepath.Clean(marketplaceRoot) {
		fatal(fmt.Errorf("unexpected marketplace add result: %#v", added))
	}

	var available pluginList
	decode(run(codexPath, isolatedHome, "plugin", "list", "--marketplace", added.MarketplaceName, "--available", "--json"), &available)
	if len(available.Installed) != 0 || len(available.Available) != 1 {
		fatal(fmt.Errorf("unexpected available inventory: %#v", available))
	}
	candidate := available.Available[0]
	if candidate.PluginID != pluginID || candidate.Version != "0.11.3-local.1" || candidate.Installed || candidate.Enabled {
		fatal(fmt.Errorf("unexpected candidate fields: %#v", candidate))
	}

	var installedReceipt struct {
		PluginID      string `json:"pluginId"`
		Version       string `json:"version"`
		InstalledPath string `json:"installedPath"`
	}
	decode(run(codexPath, isolatedHome, "plugin", "add", pluginID, "--json"), &installedReceipt)
	if installedReceipt.PluginID != pluginID || installedReceipt.Version != candidate.Version || !pathWithin(installedReceipt.InstalledPath, filepath.Join(isolatedHome, "plugins", "cache")) {
		fatal(fmt.Errorf("unexpected plugin add result: %#v", installedReceipt))
	}

	var final pluginList
	decode(run(codexPath, isolatedHome, "plugin", "list", "--marketplace", added.MarketplaceName, "--json"), &final)
	if len(final.Available) != 0 || len(final.Installed) != 1 {
		fatal(fmt.Errorf("unexpected installed inventory: %#v", final))
	}
	active := final.Installed[0]
	if active.PluginID != pluginID || active.Version != candidate.Version || !active.Installed || !active.Enabled || active.MarketplaceName != added.MarketplaceName {
		fatal(fmt.Errorf("unexpected installed fields: %#v", active))
	}
	fmt.Printf("PASS codex=%s isolatedHome=true candidate=%s installed=%v enabled=%v\n", version, active.Version, active.Installed, active.Enabled)
}

func pathWithin(child, parent string) bool {
	canonicalChild, childErr := filepath.EvalSymlinks(child)
	canonicalParent, parentErr := filepath.EvalSymlinks(parent)
	if childErr != nil || parentErr != nil {
		return false
	}
	relative, err := filepath.Rel(canonicalParent, canonicalChild)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}

func run(codexPath, codexHome string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, codexPath, args...)
	cmd.Env = append(os.Environ(), "CODEX_HOME="+codexHome)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		fatal(fmt.Errorf("codex %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String())))
	}
	return stdout.String()
}

func decode(text string, destination any) {
	if err := json.Unmarshal([]byte(text), destination); err != nil {
		fatal(fmt.Errorf("decode Codex JSON: %w: %s", err, text))
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "Codex Plugin discovery smoke:", err)
	os.Exit(1)
}
