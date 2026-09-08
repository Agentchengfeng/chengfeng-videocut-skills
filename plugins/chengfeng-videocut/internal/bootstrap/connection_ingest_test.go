package bootstrap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIngestBridgeGuardsAndReceipts(t *testing.T) {
	old := BuildChannel
	BuildChannel = "local-development"
	defer func() { BuildChannel = old }()
	ctx := context.Background()
	c := Contract{MinimumRuntimeVersion: "0.5.9"}
	caps, pid, status, posts := true, 123, 202, 0
	revision := strings.Repeat("a", 64)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/health":
			json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "ok": true, "product": "chengfeng-videocut", "productVersion": "0.5.9", "pid": pid, "runtimeMode": "foreground", "studioBuildId": "test"})
		case "/chengfeng-videocut-capabilities.json":
			features := map[string]any{"managedTimelineEditing": true}
			if caps {
				features["ingestApiVersion"] = 1
				features["transcriptCorrectionApiVersion"] = 1
			}
			json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "product": "chengfeng-videocut", "studioVersion": "0.5.9", "features": features})
		default:
			if r.Method == "POST" {
				posts++
				var b map[string]any
				json.NewDecoder(r.Body).Decode(&b)
				if b["confirmed"] != true {
					t.Error("missing confirmation")
				}
				if _, ok := b["connection"]; ok {
					t.Error("connection leaked")
				}
			}
			if status >= 400 {
				w.WriteHeader(status)
				ioJSON(w, `{"error":{"code":"revision_conflict","message":"stale"}}`)
				return
			}
			if strings.HasSuffix(r.URL.Path, "transcript-corrections") {
				json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "operationId": "op-1", "projectId": "project", "previousRevision": revision, "revision": revision, "changed": false, "correctedWordCount": 0, "subtitleScreensUpdated": 1, "subtitleNeedsAttentionCount": 2})
				return
			}
			if r.Method == "GET" && r.URL.Path != "/api/v1/ingests/op-1" {
				t.Errorf("not exact operation: %s", r.URL.Path)
			}
			w.WriteHeader(status)
			ioJSON(w, `{"schemaVersion":1,"operationId":"op-1","status":"accepted","stage":"accepted","result":null,"errorCode":null,"secret":"must not return"}`)
		}
	}))
	defer server.Close()
	conn, e := connectExisting(ctx, c, ConnectionInput{server.URL})
	if e != nil {
		t.Fatal(e)
	}
	in := IngestStartInput{Connection: conn, OperationID: "op-1", SourcePath: "/task/source.wav", ExpectedSourceSHA256: revision, TaskDirectory: "/task", Confirmed: true}
	r, e := connectedIngestStart(ctx, c, in)
	if e != nil || r["status"] != "accepted" || r["secret"] != nil {
		t.Fatalf("start: %v %v", r, e)
	}
	if posts != 1 {
		t.Fatal("start retried")
	}
	if _, e = connectedIngestStatus(ctx, c, IngestStatusInput{conn, "op-1"}); e != nil || posts != 1 {
		t.Fatalf("poll submitted: %v", e)
	}
	for _, mutate := range []func(*IngestStartInput){func(v *IngestStartInput) { v.Confirmed = false }, func(v *IngestStartInput) { v.OperationID = "../bad" }, func(v *IngestStartInput) { v.SourcePath = "relative.wav" }, func(v *IngestStartInput) { v.SourcePath = "/task/a.mp4" }, func(v *IngestStartInput) { v.ExpectedSourceSHA256 = "bad" }, func(v *IngestStartInput) { v.TaskDirectory = "/task/../task" }, func(v *IngestStartInput) { v.Language = strings.Repeat("x", 33) }, func(v *IngestStartInput) { v.AspectRatio = "5:2" }} {
		bad := in
		mutate(&bad)
		if _, e = connectedIngestStart(ctx, c, bad); e == nil {
			t.Fatal("invalid input accepted")
		}
	}
	if posts != 1 {
		t.Fatal("bad input posted")
	}
	caps = false
	if _, e = connectedIngestStart(ctx, c, in); e == nil || !strings.Contains(e.Error(), "capability_missing") {
		t.Fatalf("caps: %v", e)
	}
	caps = true
	pid++
	if _, e = connectedIngestStatus(ctx, c, IngestStatusInput{conn, "op-1"}); e == nil || !strings.Contains(e.Error(), "identity_changed") {
		t.Fatalf("drift: %v", e)
	}
	pid--
	correct := TranscriptCorrectInput{Connection: conn, ProjectID: "project", OperationID: "op-1", ExpectedRevision: revision, Corrections: []TranscriptCorrection{{"word-1", "文字"}}, Confirmed: true}
	if _, e = connectedTranscriptCorrect(ctx, c, correct); e != nil {
		t.Fatal(e)
	}
	for _, mutate := range []func(*TranscriptCorrectInput){func(v *TranscriptCorrectInput) { v.Confirmed = false }, func(v *TranscriptCorrectInput) { v.ExpectedRevision = "none" }, func(v *TranscriptCorrectInput) { v.Corrections = make([]TranscriptCorrection, 501) }, func(v *TranscriptCorrectInput) {
		v.Corrections = []TranscriptCorrection{{"word-1", strings.Repeat("字", 1001)}}
	}, func(v *TranscriptCorrectInput) {
		v.Corrections = []TranscriptCorrection{{"word-1", "a"}, {"word-1", "b"}}
	}} {
		bad := correct
		mutate(&bad)
		if _, e = connectedTranscriptCorrect(ctx, c, bad); e == nil {
			t.Fatal("invalid correction accepted")
		}
	}
	status = 409
	if _, e = connectedTranscriptCorrect(ctx, c, correct); e == nil || !strings.Contains(e.Error(), "revision_conflict") {
		t.Fatalf("CAS: %v", e)
	}
	status = 503
	before := posts
	if _, e = connectedIngestStart(ctx, c, in); e == nil || !strings.Contains(e.Error(), "same operationId") {
		t.Fatalf("HTTP: %v", e)
	}
	if posts != before+1 {
		t.Fatal("HTTP failure retried")
	}
	BuildChannel = "release"
	if _, e = connectedIngestStart(ctx, c, in); e == nil {
		t.Fatal("release accepted")
	}
}
