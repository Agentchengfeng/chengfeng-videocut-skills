package bootstrap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestConnectedProjectConfig(t *testing.T) {
	old := BuildChannel
	BuildChannel = "local-development"
	defer func() { BuildChannel = old }()
	for _, scenario := range []string{"read", "read-null", "write", "no-change", "conflict", "unknown-outcome", "missing-confirmation", "missing-revision", "invalid-aspect", "extra-field", "empty-config", "null-aspect", "missing-capability", "identity-drift", "capability-identity-drift", "readback-mismatch", "readback-project", "readback-revision", "readback-identity"} {
		t.Run(scenario, func(t *testing.T) {
			ctx := context.Background()
			contract := Contract{MinimumRuntimeVersion: "0.5.7"}
			before, after := strings.Repeat("a", 64), strings.Repeat("b", 64)
			patches, gets, healths := 0, 0, 0
			aspect := any("16:9")
			revision := before
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/health":
					healths++
					pid, cap := 123, 1
					if scenario == "missing-capability" {
						cap = 0
					}
					if (scenario == "identity-drift" && healths > 1) || (scenario == "capability-identity-drift" && healths > 2) || (scenario == "readback-identity" && patches > 0) {
						pid++
					}
					json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "ok": true, "product": "chengfeng-videocut", "productVersion": "0.5.9", "pid": pid, "runtimeMode": "foreground", "studioBuildId": "qa", "projectConfigApiVersion": cap})
				case "/chengfeng-videocut-capabilities.json":
					ioJSON(w, `{"schemaVersion":1,"product":"chengfeng-videocut","studioVersion":"0.5.9","features":{"managedTimelineEditing":true}}`)
				case "/api/v1/projects/demo/project-config":
					if r.Method == "PATCH" {
						patches++
						var body map[string]any
						if e := json.NewDecoder(r.Body).Decode(&body); e != nil {
							t.Error(e)
						}
						if len(body) != 3 || body["confirmed"] != true || body["expectedRevision"] != before || body["config"].(map[string]any)["aspectRatio"] != "4:3" {
							t.Errorf("unexpected PATCH %#v", body)
						}
						if scenario == "conflict" {
							w.WriteHeader(409)
							ioJSON(w, `{"error":{"code":"revision_conflict","message":"stale revision"}}`)
							return
						}
						if scenario == "unknown-outcome" {
							w.WriteHeader(500)
							ioJSON(w, `{"error":{"code":"internal_error","message":"unknown"}}`)
							return
						}
						aspect = "4:3"
						if scenario != "no-change" {
							revision = after
						}
					} else if r.Method == "GET" {
						gets++
					} else {
						t.Errorf("unexpected method %s", r.Method)
					}
					project := "demo"
					responseRevision := revision
					responseAspect := aspect
					if scenario == "read-null" {
						responseAspect = nil
					}
					if r.Method == "GET" {
						if scenario == "readback-mismatch" {
							responseAspect = "9:16"
						}
						if scenario == "readback-project" {
							project = "other"
						}
						if scenario == "readback-revision" {
							responseRevision = before
						}
					}
					result := map[string]any{"schemaVersion": 1, "projectId": project, "projectRevision": responseRevision, "configRevision": after, "config": map[string]any{"aspectRatio": responseAspect}}
					if r.Method == "PATCH" {
						result["changed"] = scenario != "no-change"
						result["previousRevision"] = before
					}
					json.NewEncoder(w).Encode(result)
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					w.WriteHeader(404)
				}
			}))
			defer s.Close()
			conn, err := connectExisting(ctx, contract, ConnectionInput{s.URL})
			if err != nil {
				t.Fatal(err)
			}
			in := ProjectConfigInput{Connection: conn, ProjectID: "demo", Config: map[string]any{"aspectRatio": "4:3"}, Confirmed: true, ExpectedRevision: before}
			switch scenario {
			case "read", "read-null":
				in.Config = nil
			case "missing-confirmation":
				in.Confirmed = false
			case "missing-revision":
				in.ExpectedRevision = "none"
			case "invalid-aspect":
				in.Config["aspectRatio"] = "2:1"
			case "extra-field":
				in.Config["status"] = "done"
			case "empty-config":
				in.Config = map[string]any{}
			case "null-aspect":
				in.Config["aspectRatio"] = nil
			}
			result, err := connectedProjectConfig(ctx, contract, in)
			success := scenario == "read" || scenario == "read-null" || scenario == "write" || scenario == "no-change"
			if success {
				if err != nil {
					t.Fatal(err)
				}
				if result["projectId"] != "demo" || gets != 1 {
					t.Fatalf("result=%#v gets=%d", result, gets)
				}
			} else if err == nil {
				t.Fatal("unsafe request accepted")
			}
			expectPatch := scenario == "write" || scenario == "no-change" || scenario == "conflict" || scenario == "unknown-outcome" || strings.HasPrefix(scenario, "readback-")
			if (patches == 1) != expectPatch || patches > 1 {
				t.Fatalf("patches=%d wantPatch=%v", patches, expectPatch)
			}
			if scenario == "conflict" && !strings.Contains(err.Error(), "revision_conflict") {
				t.Fatal(err)
			}
			if scenario == "unknown-outcome" && (!strings.Contains(err.Error(), "GET") || !strings.Contains(err.Error(), "do not retry blindly")) {
				t.Fatal(err)
			}
		})
	}
}
