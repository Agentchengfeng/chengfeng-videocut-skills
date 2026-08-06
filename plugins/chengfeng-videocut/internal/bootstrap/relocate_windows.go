//go:build windows

package bootstrap

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"golang.org/x/sys/windows"
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
	if err := ensureRelocatedExecutable(source, destination, digest); err != nil {
		return false, err
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

func ensureRelocatedExecutable(source, destination, digest string) error {
	if actual, err := fileSHA256(destination); err == nil && actual == digest {
		return nil
	}
	directory := filepath.Dir(destination)
	unlock, err := acquireRelocationLock(filepath.Join(directory, ".relocate.lock"), 10*time.Second)
	if err != nil {
		return err
	}
	defer unlock()
	// Another process may have completed the content-addressed copy while this
	// process waited for the mutex.
	if actual, err := fileSHA256(destination); err == nil && actual == digest {
		return nil
	}
	staging, err := os.MkdirTemp(directory, ".relocate-stage-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	temporary := filepath.Join(staging, "chengfeng-videocut-mcp.exe")
	if err := copyExecutable(source, temporary); err != nil {
		return err
	}
	if actual, err := fileSHA256(temporary); err != nil || actual != digest {
		return fmt.Errorf("relocated MCP digest mismatch")
	}
	if err := os.Remove(destination); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("replace invalid relocated MCP: %w", err)
	}
	if err := os.Rename(temporary, destination); err != nil {
		return err
	}
	actual, err := fileSHA256(destination)
	if err != nil || actual != digest {
		return fmt.Errorf("published relocated MCP digest mismatch")
	}
	return nil
}

func acquireRelocationLock(path string, timeout time.Duration) (func(), error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	overlapped := &windows.Overlapped{}
	deadline := time.Now().Add(timeout)
	for {
		err = windows.LockFileEx(windows.Handle(file.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, overlapped)
		if err == nil {
			return func() {
				_ = windows.UnlockFileEx(windows.Handle(file.Fd()), 0, 1, 0, overlapped)
				_ = file.Close()
			}, nil
		}
		if err != windows.ERROR_LOCK_VIOLATION || time.Now().After(deadline) {
			_ = file.Close()
			return nil, fmt.Errorf("acquire relocation mutex: %w", err)
		}
		time.Sleep(25 * time.Millisecond)
	}
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
