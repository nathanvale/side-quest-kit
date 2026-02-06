---
"@side-quest/kit": minor
---

Initial release of @side-quest/kit - MCP server with 7 tools for token-efficient codebase navigation via the Kit CLI (cased-kit).

MCP Tools:
- `kit_prime` - Generate/refresh PROJECT_INDEX.json for token-efficient symbol lookup
- `kit_find` - Symbol lookup and file overview from PROJECT_INDEX.json
- `kit_references` - Find all references to a symbol (callers + usages)
- `kit_semantic` - Semantic code search via vector embeddings with grep fallback
- `kit_ast_search` - Tree-sitter powered structural code search
- `kit_context` - Extract enclosing definition around a file:line location
- `kit_chunk` - Split files into LLM-friendly chunks (symbols or lines strategy)
