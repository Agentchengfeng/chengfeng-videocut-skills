// native-mcp-raw-smoke intentionally avoids the MCP client SDK. It checks the
// exact JSON that Codex receives over STDIO, including false-valued hints that
// older go-sdk releases accidentally omitted.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"time"
)

const protocolVersion = "2025-06-18"

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   json.RawMessage `json:"error"`
}

func main() {
	if len(os.Args) != 2 {
		fatal(fmt.Errorf("usage: native-mcp-raw-smoke /absolute/path/to/mcp"))
	}
	cmd := exec.Command(os.Args[1])
	stdin, err := cmd.StdinPipe()
	if err != nil {
		fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		fatal(err)
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		fatal(err)
	}
	defer func() {
		_ = stdin.Close()
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	enc := json.NewEncoder(stdin)
	dec := json.NewDecoder(bufio.NewReader(stdout))
	request(enc, 1, "initialize", map[string]any{
		"protocolVersion": protocolVersion,
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "raw-smoke", "version": "1"},
	})
	init := readResponse(dec, 1)
	var initialized struct {
		ProtocolVersion string `json:"protocolVersion"`
	}
	decodeResult(init, &initialized)
	if initialized.ProtocolVersion != protocolVersion {
		fatal(fmt.Errorf("protocol=%q, want %q", initialized.ProtocolVersion, protocolVersion))
	}
	if err := enc.Encode(map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"}); err != nil {
		fatal(err)
	}
	request(enc, 2, "tools/list", map[string]any{})
	listed := readResponse(dec, 2)
	var toolsResult struct {
		Tools []struct {
			Name        string         `json:"name"`
			Annotations map[string]any `json:"annotations"`
		} `json:"tools"`
	}
	decodeResult(listed, &toolsResult)
	want := map[string]map[string]bool{
		"show_workflow_confirmation": {"readOnlyHint": true, "destructiveHint": false, "openWorldHint": false, "idempotentHint": false},
		"runtime_status":             {"readOnlyHint": true, "destructiveHint": false, "openWorldHint": false, "idempotentHint": false},
		"runtime_install":            {"readOnlyHint": false, "destructiveHint": true, "openWorldHint": true, "idempotentHint": false},
		"runtime_cli":                {"readOnlyHint": false, "destructiveHint": true, "openWorldHint": true, "idempotentHint": false},
	}
	seen := make([]string, 0, len(toolsResult.Tools))
	for _, tool := range toolsResult.Tools {
		expected, ok := want[tool.Name]
		if !ok {
			fatal(fmt.Errorf("unexpected tool %q", tool.Name))
		}
		seen = append(seen, tool.Name)
		for key, expectedValue := range expected {
			actual, exists := tool.Annotations[key]
			actualBool, isBool := actual.(bool)
			if !exists || !isBool || actualBool != expectedValue {
				fatal(fmt.Errorf("%s annotations.%s=%#v (exists=%v), want explicit %v", tool.Name, key, actual, exists, expectedValue))
			}
		}
	}
	if len(seen) != len(want) {
		fatal(fmt.Errorf("tools=%v, want %d tools", seen, len(want)))
	}
	sort.Strings(seen)
	fmt.Printf("PASS raw_protocol=%s explicit_annotation_boole=16 tools=%v\n", initialized.ProtocolVersion, seen)
}

func request(enc *json.Encoder, id int, method string, params map[string]any) {
	if err := enc.Encode(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}); err != nil {
		fatal(err)
	}
}

func readResponse(dec *json.Decoder, id int) response {
	result := make(chan response, 1)
	errs := make(chan error, 1)
	go func() {
		var value response
		if err := dec.Decode(&value); err != nil {
			errs <- err
			return
		}
		result <- value
	}()
	select {
	case value := <-result:
		if len(value.Error) != 0 && string(value.Error) != "null" {
			fatal(fmt.Errorf("response %d error: %s", id, value.Error))
		}
		return value
	case err := <-errs:
		if err == io.EOF {
			fatal(fmt.Errorf("server closed before response %d", id))
		}
		fatal(err)
	case <-time.After(10 * time.Second):
		fatal(fmt.Errorf("response %d timed out", id))
	}
	return response{}
}

func decodeResult(value response, destination any) {
	if err := json.Unmarshal(value.Result, destination); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "native MCP raw smoke:", err)
	os.Exit(1)
}
