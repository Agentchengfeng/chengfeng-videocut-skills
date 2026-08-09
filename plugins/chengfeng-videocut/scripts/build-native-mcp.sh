#!/bin/sh
set -eu

plugin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output_dir="$plugin_root/bin"
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/chengfeng-videocut-native.XXXXXX")
trap 'rm -rf -- "$build_dir"' EXIT HUP INT TERM

version=0.11.4-local.1
package=./cmd/chengfeng-videocut-mcp
ldflags="-s -w -buildid= -X github.com/Agentchengfeng/chengfeng-videocut-skills/plugins/chengfeng-videocut/internal/bootstrap.Version=$version -X github.com/Agentchengfeng/chengfeng-videocut-skills/plugins/chengfeng-videocut/internal/bootstrap.BuildChannel=release"

mkdir -p -- "$output_dir"
cd -- "$plugin_root"

CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -buildvcs=false -trimpath -ldflags "$ldflags" -o "$build_dir/mcp-arm64" "$package"
CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -buildvcs=false -trimpath -ldflags "$ldflags" -o "$build_dir/mcp-amd64" "$package"
lipo -create "$build_dir/mcp-arm64" "$build_dir/mcp-amd64" -output "$output_dir/chengfeng-videocut-mcp"
chmod 0755 "$output_dir/chengfeng-videocut-mcp"

CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -buildvcs=false -trimpath -ldflags "$ldflags" -o "$output_dir/chengfeng-videocut-mcp.exe" "$package"
chmod 0644 "$output_dir/chengfeng-videocut-mcp.exe"

file "$output_dir/chengfeng-videocut-mcp" "$output_dir/chengfeng-videocut-mcp.exe"
shasum -a 256 "$output_dir/chengfeng-videocut-mcp" "$output_dir/chengfeng-videocut-mcp.exe"
