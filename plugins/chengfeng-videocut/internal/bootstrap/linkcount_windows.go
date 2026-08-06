//go:build windows

package bootstrap

import (
	"fmt"
	"os"
	"syscall"

	"golang.org/x/sys/windows"
)

func validateSingleLink(path string, _ os.FileInfo) error {
	pathUTF16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	handle, err := windows.CreateFile(
		pathUTF16,
		windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_ATTRIBUTE_NORMAL,
		0,
	)
	if err != nil {
		return fmt.Errorf("open managed runtime launcher for link check: %w", err)
	}
	defer windows.CloseHandle(handle)
	var details windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(handle, &details); err != nil {
		return fmt.Errorf("read managed runtime launcher link count: %w", err)
	}
	if details.NumberOfLinks != 1 {
		return fmt.Errorf("managed runtime launcher must have exactly one hard link: %s", path)
	}
	return nil
}
