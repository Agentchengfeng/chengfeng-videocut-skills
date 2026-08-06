//go:build windows

package bootstrap

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

const relocatedMarker = "CHENGFENG_VIDEOCUT_MCP_RELOCATED"

// RelocateForCacheRelease hands stdio to a content-addressed copy outside the
// Marketplace cache. Windows locks a running .exe even after chdir, so this is
// required in addition to releasing cwd.
func RelocateForCacheRelease() (bool, error) {
	if os.Getenv(relocatedMarker) == "1" {
		return false, nil
	}
	source, err := os.Executable()
	if err != nil {
		return false, err
	}
	digest, err := fileSHA256(source)
	if err != nil {
		return false, err
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return false, err
	}
	directory := filepath.Join(cache, "chengfeng-videocut", "mcp-bootstrap", digest)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return false, err
	}
	destination := filepath.Join(directory, "chengfeng-videocut-mcp.exe")
	if actual, verifyErr := fileSHA256(destination); verifyErr != nil || actual != digest {
		temporary := destination + ".new"
		_ = os.Remove(temporary)
		if err := copyExecutable(source, temporary); err != nil {
			return false, err
		}
		if actual, err := fileSHA256(temporary); err != nil || actual != digest {
			_ = os.Remove(temporary)
			return false, fmt.Errorf("relocated MCP digest mismatch")
		}
		_ = os.Remove(destination)
		if err := os.Rename(temporary, destination); err != nil {
			return false, err
		}
	}
	cmd := exec.Command(destination)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = append(os.Environ(), relocatedMarker+"=1")
	if err := cmd.Start(); err != nil {
		return false, err
	}
	if err := cmd.Process.Release(); err != nil {
		return false, err
	}
	return true, nil
}

func copyExecutable(source, destination string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Sync(); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
