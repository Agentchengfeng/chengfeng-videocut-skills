package bootstrap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExistingConnectionBoundaries(t *testing.T) {
	old := BuildChannel
	BuildChannel = "local-development"
	defer func() { BuildChannel = old }()
	c := Contract{MinimumRuntimeVersion: "0.5.7"}
	for _, raw := range []string{"https://127.0.0.1:1234", "http://localhost:1234", "http://example.com:1234", "http://127.0.0.1:1234/path", "http://user@127.0.0.1:1234", "http://127.0.0.1:1234?x=y"} {
		if _, err := connectionEndpoint(raw); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	revision := strings.Repeat("a", 64)
	pid := 123
	puts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/health":
			json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "ok": true, "product": "chengfeng-videocut", "productVersion": "0.5.9", "pid": pid, "runtimeMode": "foreground", "studioBuildId": "test"})
		case "/chengfeng-videocut-capabilities.json":
			ioJSON(w, `{"schemaVersion":1,"product":"chengfeng-videocut","studioVersion":"0.5.9","features":{"managedTimelineEditing":true}}`)
		default:
			if r.Method == "PUT" {
				puts++
				var body map[string]any
				json.NewDecoder(r.Body).Decode(&body)
				if body["expectedRevision"] != revision {
					w.WriteHeader(409)
					ioJSON(w, `{"error":{"code":"revision_conflict"}}`)
					return
				}
			}
			json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "projectId": "项目", "revision": revision, "document": map[string]any{"layers": []any{}}})
		}
	}))
	defer server.Close()
	conn, err := connectExisting(context.Background(), c, ConnectionInput{server.URL})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = readConnectedProject(context.Background(), c, ProjectReadInput{conn, "项目", "visuals"}); err != nil {
		t.Fatal(err)
	}
	input := VisualsPutInput{conn, "项目", true, revision, map[string]any{"layers": []any{}}}
	if _, err = putConnectedVisuals(context.Background(), c, input); err != nil {
		t.Fatal(err)
	}
	input.ExpectedRevision = strings.Repeat("b", 64)
	if _, err = putConnectedVisuals(context.Background(), c, input); err == nil || !strings.Contains(err.Error(), "revision_conflict") {
		t.Fatalf("missing revision rejection: %v", err)
	}
	input.Confirmed = false
	before := puts
	if _, err = putConnectedVisuals(context.Background(), c, input); err == nil || puts != before {
		t.Fatal("unconfirmed request reached writer")
	}
	pid++
	if _, err = readConnectedProject(context.Background(), c, ProjectReadInput{conn, "项目", "visuals"}); err == nil || !strings.Contains(err.Error(), "service_identity_changed") {
		t.Fatalf("identity drift not rejected: %v", err)
	}
	BuildChannel = "release"
	if _, err = connectExisting(context.Background(), c, ConnectionInput{server.URL}); err == nil {
		t.Fatal("release accepted development connection")
	}
}
func ioJSON(w http.ResponseWriter, s string) { _, _ = w.Write([]byte(s)) }
func TestExistingConnectionRejectsRedirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "http://example.com", 302) }))
	defer server.Close()
	if _, err := connectionJSON(context.Background(), server.URL, "/api/health", "GET", nil); err == nil {
		t.Fatal("redirect accepted")
	}
}
