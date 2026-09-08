package bootstrap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMediaConnectionFailsClosed(t *testing.T) {
	old := BuildChannel
	BuildChannel = "local-development"
	defer func() { BuildChannel = old }()
	c := Contract{MinimumRuntimeVersion: "0.5.7"}
	cap := 0
	pid := 123
	gets := 0
	hash := strings.Repeat("a", 64)
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/health":
			json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "ok": true, "product": "chengfeng-videocut", "productVersion": "0.5.9", "pid": pid, "runtimeMode": "foreground", "studioBuildId": "qa", "mediaAssetsApiVersion": cap})
		case "/chengfeng-videocut-capabilities.json":
			ioJSON(w, `{"schemaVersion":1,"product":"chengfeng-videocut","studioVersion":"0.5.9","features":{"managedTimelineEditing":true}}`)
		default:
			gets++
			json.NewEncoder(w).Encode(map[string]any{"projectId": "demo", "manifest": map[string]any{"assetId": hash, "sha256": hash}})
		}
	}))
	defer s.Close()
	conn, e := connectExisting(context.Background(), c, ConnectionInput{s.URL})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = getConnectedMedia(context.Background(), c, MediaGetInput{conn, "demo", hash}); e == nil || gets != 0 {
		t.Fatal("missing capability accepted")
	}
	cap = 1
	if _, e = getConnectedMedia(context.Background(), c, MediaGetInput{conn, "demo", hash}); e != nil {
		t.Fatal(e)
	}
	if _, e = importConnectedMedia(context.Background(), c, MediaImportInput{Connection: conn, ProjectID: "demo", SourcePath: "/tmp/x.mp4", ExpectedSourceSHA256: hash}); e == nil {
		t.Fatal("unconfirmed accepted")
	}
	pid++
	if _, e = getConnectedMedia(context.Background(), c, MediaGetInput{conn, "demo", hash}); e == nil {
		t.Fatal("identity drift accepted")
	}
}
