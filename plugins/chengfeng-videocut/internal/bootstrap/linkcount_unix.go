//go:build !windows

package bootstrap

import (
	"fmt"
	"os"
	"syscall"
)

func validateSingleLink(path string, info os.FileInfo) error {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fmt.Errorf("managed runtime launcher link count is unavailable: %s", path)
	}
	if stat.Nlink != 1 {
		return fmt.Errorf("managed runtime launcher must have exactly one hard link: %s", path)
	}
	return nil
}
