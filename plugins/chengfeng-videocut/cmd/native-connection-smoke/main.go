// Exercises the candidate native STDIO bridge against an already-running server.
// Writes are opt-in and intended only for isolated fixture projects.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"os"
	"os/exec"
	"strings"
	"time"
)

func main() {
	if len(os.Args) < 4 {
		panic("usage: native-connection-smoke binary endpoint project [--fixture-write]")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "connection-smoke", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: exec.Command(os.Args[1])}, nil)
	must(err)
	defer session.Close()
	call := func(name string, args map[string]any) (map[string]any, error) {
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: args})
		if err != nil {
			return nil, err
		}
		if result.IsError {
			return nil, fmt.Errorf("%s: %v", name, result.Content)
		}
		raw, err := json.Marshal(result.StructuredContent)
		if err != nil {
			return nil, err
		}
		var data map[string]any
		err = json.Unmarshal(raw, &data)
		return data, err
	}
	connection, err := call("runtime_connect", map[string]any{"endpoint": os.Args[2]})
	must(err)
	printJSON("connection", connection)
	var visuals map[string]any
	for _, resource := range []string{"workflow", "edit-list", "subtitles", "visuals"} {
		data, err := call("runtime_project", map[string]any{"connection": connection, "projectId": os.Args[3], "resource": resource})
		must(err)
		printJSON(resource, data)
		if resource == "visuals" {
			visuals = data
		}
	}
	if len(os.Args) > 4 && os.Args[4] == "--fixture-write" {
		doc := visuals["document"]
		if doc == nil {
			panic("fixture must contain a real visuals document")
		}
		fixtureDocument := doc.(map[string]any)
		layers := fixtureDocument["layers"].([]any)
		if len(layers) == 0 {
			panic("fixture must have a layer to remove")
		}
		fixtureDocument["layers"] = layers[:len(layers)-1]
		args := map[string]any{"connection": connection, "projectId": os.Args[3], "confirmed": true, "expectedRevision": visuals["revision"], "document": doc}
		result, err := call("runtime_visuals_put", args)
		must(err)
		if result["revision"] == visuals["revision"] {
			panic("fixture write did not change revision")
		}
		printJSON("write-readback", result)
		args["expectedRevision"] = strings.Repeat("0", 64)
		if _, err = call("runtime_visuals_put", args); err == nil {
			panic("stale revision accepted")
		}
		fmt.Println("PASS stale revision rejected")
	}
	changed := map[string]any{}
	for k, v := range connection {
		changed[k] = v
	}
	changed["buildId"] = "changed"
	if _, err = call("runtime_project", map[string]any{"connection": changed, "projectId": os.Args[3], "resource": "visuals"}); err == nil {
		panic("changed identity accepted")
	}
	fmt.Println("PASS changed identity rejected")
	fmt.Println("PASS native STDIO connection")
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
func printJSON(label string, v any) {
	b, err := json.Marshal(v)
	must(err)
	fmt.Printf("%s %s\n", label, b)
}
