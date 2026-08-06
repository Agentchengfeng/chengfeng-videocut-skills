//go:build !windows

package bootstrap

func RelocateForCacheRelease() (bool, error) { return false, nil }
