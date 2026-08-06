package main

import (
	"context"
	"fmt"
	"os"

	"github.com/Agentchengfeng/chengfeng-videocut-skills/plugins/chengfeng-videocut/internal/bootstrap"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	relocated, err := bootstrap.RelocateForCacheRelease()
	if err != nil {
		fatal(fmt.Errorf("release Windows plugin cache: %w", err))
	}
	if relocated {
		return
	}
	contract, err := bootstrap.LoadContract()
	if err != nil {
		fatal(err)
	}
	server := bootstrap.NewServer(contract)
	// All plugin files are embedded. Releasing cwd prevents a live MCP process
	// from pinning the mutable Marketplace cache on Windows.
	if err := os.Chdir(os.TempDir()); err != nil {
		fatal(fmt.Errorf("release plugin cwd: %w", err))
	}
	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "chengfeng-videocut MCP:", err)
	os.Exit(1)
}
