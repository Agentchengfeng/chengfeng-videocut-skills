package pluginassets

import _ "embed"

// ReviewHTML is embedded so the MCP can release the mutable plugin-cache cwd.
//
//go:embed public/review-confirm.html
var ReviewHTML string

// RuntimeRequirements is the single production asset contract.
//
//go:embed runtime-requirements.json
var RuntimeRequirements []byte

// RuntimeContractSnapshot is the canonical Runtime-owned capability and CLI contract.
//
//go:embed runtime-contract.snapshot.json
var RuntimeContractSnapshot []byte
