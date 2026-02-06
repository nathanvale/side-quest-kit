# @side-quest/kit

MCP server with 7 tools for token-efficient codebase navigation using the [Kit CLI](https://github.com/cased/kit) (cased-kit).

Uses PROJECT_INDEX.json for up to 50x token savings compared to reading full source files.

## Prerequisites

Install the Kit CLI:

```bash
# Basic installation
uv tool install cased-kit

# With ML dependencies (required for semantic search)
uv tool install 'cased-kit[ml]'
```

## Installation

```bash
npm install @side-quest/kit
```

## MCP Server Configuration

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "kit": {
      "command": "bunx",
      "args": ["--bun", "@side-quest/kit"]
    }
  }
}
```

## MCP Tools

### kit_prime

Generate or refresh the PROJECT_INDEX.json file for a repository. Run this first to enable token-efficient symbol lookup.

### kit_find

Look up symbol definitions or get an overview of all symbols in a file from the PROJECT_INDEX.json index. Supports exact and fuzzy matching.

### kit_references

Find all references to a symbol - callers, usages, or both. Supports three modes: `all`, `callers_only`, and `definitions_only`.

### kit_semantic

Semantic code search using vector embeddings. Falls back to grep-based search if the ML index is not available. Supports `chunk_by` parameter for different chunking strategies.

### kit_ast_search

Structural code search using Tree-sitter AST parsing. Search for patterns like "async functions that call fetch" or specific code structures using `simple` or `pattern` mode.

### kit_context

Extract the full enclosing definition (function, class, method) around a specific file and line number. Useful for getting complete context without reading entire files.

### kit_chunk

Split a source file into LLM-friendly chunks. Supports two strategies:
- `symbols` - chunk at function/class boundaries (default)
- `lines` - chunk by line count with configurable `max_lines`

## CLI

The package also includes a CLI for direct terminal usage:

```bash
# Generate index
side-quest-kit prime [path]

# Find symbols
side-quest-kit find <symbol> [--format json|markdown]

# Search semantically
side-quest-kit search <query> [--top-k 10]

# Find callers
side-quest-kit callers <symbol> [--format json|markdown]
```

## Development

```bash
bun install
bun test
bun run build
bun run validate    # Full quality check (lint + types + build + test)
```

## License

MIT
