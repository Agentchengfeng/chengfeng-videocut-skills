package bootstrap

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestModuleCandidateBoundsAndLinks(t *testing.T) {
	dir := t.TempDir()
	real, e := filepath.EvalSymlinks(dir)
	if e != nil {
		t.Fatal(e)
	}
	dir = real
	b := []byte("<html>bird</html>")
	sum := sha256.Sum256(b)
	m := ModuleManifest{1, "bird", "v1", "index.html", []ModuleFile{{"index.html", hex.EncodeToString(sum[:]), len(b)}}}
	write := func() {
		raw, _ := json.Marshal(m)
		if e := os.WriteFile(filepath.Join(dir, "module-manifest.json"), raw, 0600); e != nil {
			t.Fatal(e)
		}
	}
	os.WriteFile(filepath.Join(dir, "index.html"), b, 0600)
	write()
	if _, _, e := readModuleCandidate(dir); e != nil {
		t.Fatal(e)
	}
	m.Files[0].SHA256 = string(make([]byte, 64))
	write()
	if _, _, e := readModuleCandidate(dir); e == nil {
		t.Fatal("hash accepted")
	}
	m.Files[0].SHA256 = hex.EncodeToString(sum[:])
	write()
	os.Remove(filepath.Join(dir, "index.html"))
	os.Symlink(filepath.Join(dir, "module-manifest.json"), filepath.Join(dir, "index.html"))
	if _, _, e := readModuleCandidate(dir); e == nil {
		t.Fatal("symlink accepted")
	}
}
