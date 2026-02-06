# Changelog

## 0.2.0

### Minor Changes

- [#7](https://github.com/nathanvale/side-quest-kit/pull/7) [`9268c7c`](https://github.com/nathanvale/side-quest-kit/commit/9268c7c1d0b11fc781f7eb371941d8887b309436) Thanks [@nathanvale](https://github.com/nathanvale)! - Initial release of @side-quest/kit - MCP server with 7 tools for token-efficient codebase navigation via the Kit CLI (cased-kit).

  MCP Tools:

  - `kit_prime` - Generate/refresh PROJECT_INDEX.json for token-efficient symbol lookup
  - `kit_find` - Symbol lookup and file overview from PROJECT_INDEX.json
  - `kit_references` - Find all references to a symbol (callers + usages)
  - `kit_semantic` - Semantic code search via vector embeddings with grep fallback
  - `kit_ast_search` - Tree-sitter powered structural code search
  - `kit_context` - Extract enclosing definition around a file:line location
  - `kit_chunk` - Split files into LLM-friendly chunks (symbols or lines strategy)

### Patch Changes

- [#10](https://github.com/nathanvale/side-quest-kit/pull/10) [`9bf7a7f`](https://github.com/nathanvale/side-quest-kit/commit/9bf7a7f529f9293bb1eab3986c55c56c64ea1e77) Thanks [@nathanvale](https://github.com/nathanvale)! - Sync CI/CD improvements from upstream bun-typescript-starter template

## 0.1.0

### Minor Changes

- [#5](https://github.com/nathanvale/side-quest-kit/pull/5) [`279b000`](https://github.com/nathanvale/side-quest-kit/commit/279b0004159b2787cbf38c834f748498d98a21c0) Thanks [@nathanvale](https://github.com/nathanvale)! - Initial release of @side-quest/kit - MCP server with 7 tools for token-efficient codebase navigation.

  Tools included:

  - `kit_grep` - fast regex search across files
  - `kit_files` - glob-based file discovery
  - `kit_semantic` - semantic code search via embeddings
  - `kit_symbols` - AST-powered symbol extraction
  - `kit_callers` - find callers of a function/method
  - `kit_context` - retrieve file context around a location
  - `kit_index_find` - query the kit index for matches

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Initial release.
