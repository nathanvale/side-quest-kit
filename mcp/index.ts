#!/usr/bin/env bun

/**
 * Kit MCP Server (Slim)
 *
 * 7 focused tools for token-efficient codebase navigation using Kit CLI.
 *
 * Tools:
 *   1. kit_prime     - Generate/refresh PROJECT_INDEX.json
 *   2. kit_find      - Symbol lookup + file overview (merged)
 *   3. kit_references - Callers + usages (merged)
 *   4. kit_semantic  - Vector search with grep fallback
 *   5. kit_ast_search - Tree-sitter structural search
 *   6. kit_context   - Extract enclosing definition around file:line
 *   7. kit_chunk     - Split file into LLM-friendly chunks
 *
 * Observability: JSONL file logging to ~/.claude/logs/kit.jsonl
 */

import { getLanguageForExtension } from '@side-quest/core/formatters'
import { createCorrelationId, startServer, tool, z } from '@side-quest/core/mcp'
import {
	createLoggerAdapter,
	ResponseFormat,
	wrapToolHandler,
} from '@side-quest/core/mcp-response'
import { buildEnhancedPath, spawnSyncCollect } from '@side-quest/core/spawn'
import { safeJsonParse } from '@side-quest/core/utils'
import { validatePathOrDefault } from '@side-quest/core/validation'
import {
	executeAstSearch,
	executeIndexFind,
	executeIndexOverview,
	executeIndexPrime,
	executeKitGrep,
	executeKitSemantic,
	executeKitUsages,
	formatIndexFindResults,
	formatIndexOverviewResults,
	formatIndexPrimeResults,
	formatSemanticResults,
	SearchMode,
	validateAstSearchInputs,
	validateSemanticInputs,
	validateUsagesInputs,
} from '../src/lib/index.js'
import {
	astLogger,
	chunkLogger,
	contextLogger,
	initLogger,
	referencesLogger,
	semanticLogger,
	symbolsLogger,
} from '../src/lib/logger.js'

// ============================================================================
// Logger Init + Adapters
// ============================================================================

initLogger().catch(console.error)

const symbolsAdapter = createLoggerAdapter(symbolsLogger)
const referencesAdapter = createLoggerAdapter(referencesLogger)
const semanticAdapter = createLoggerAdapter(semanticLogger)
const astAdapter = createLoggerAdapter(astLogger)
const contextAdapter = createLoggerAdapter(contextLogger)
const chunkAdapter = createLoggerAdapter(chunkLogger)

// ============================================================================
// 1. kit_prime - Generate/refresh PROJECT_INDEX.json
// ============================================================================

tool(
	'kit_prime',
	{
		description: `Generate or refresh PROJECT_INDEX.json for the codebase.

Creates a pre-built index enabling token-efficient queries:
- Indexes all symbols (functions, classes, types, etc.)
- Enables fast symbol lookup without scanning files
- Auto-detects git repository root

The index is valid for 24 hours. Use force=true to regenerate.

Requires Kit CLI: uv tool install cased-kit`,
		inputSchema: {
			path: z
				.string()
				.optional()
				.describe('Directory to index (default: git root, then CWD)'),
			force: z
				.boolean()
				.optional()
				.describe('Force regenerate even if index is less than 24 hours old'),
			response_format: z
				.enum(['markdown', 'json'])
				.optional()
				.default('json')
				.describe("Output format: 'markdown' or 'json' (default)"),
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	wrapToolHandler(
		async (args, format) => {
			const { path, force } = args as { path?: string; force?: boolean }
			const result = await executeIndexPrime(force, path)

			if ('isError' in result && result.isError) {
				throw new Error(result.error)
			}

			return formatIndexPrimeResults(result, format)
		},
		{
			toolName: 'kit_prime',
			logger: symbolsAdapter,
			createCid: createCorrelationId,
		},
	),
)

// ============================================================================
// 2. kit_find - Symbol lookup + file overview (merged)
// ============================================================================

tool(
	'kit_find',
	{
		description: `Find symbol definitions or list all symbols in a file from PROJECT_INDEX.json.

Two modes:
- Symbol lookup: Pass symbol_name to find where a function/class/type is defined
- File overview: Pass file_path to see all symbols in a file without reading source

~50x token savings compared to reading full files.

NOTE: Requires PROJECT_INDEX.json. Run kit_prime first if not present.`,
		inputSchema: {
			symbol_name: z
				.string()
				.optional()
				.describe(
					'Symbol name to search for. Example: "executeKitGrep". Provide this OR file_path.',
				),
			file_path: z
				.string()
				.optional()
				.describe(
					'File path to get all symbols for (relative to repo root). Example: "src/kit-wrapper.ts". Provide this OR symbol_name.',
				),
			index_path: z
				.string()
				.optional()
				.describe(
					'Path to PROJECT_INDEX.json or directory containing it (default: walks up to find it)',
				),
			response_format: z
				.enum(['markdown', 'json'])
				.optional()
				.default('json')
				.describe("Output format: 'markdown' or 'json' (default)"),
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	wrapToolHandler(
		async (args, format) => {
			const { symbol_name, file_path, index_path } = args as {
				symbol_name?: string
				file_path?: string
				index_path?: string
			}

			if (!symbol_name && !file_path) {
				throw new Error(
					'Either symbol_name or file_path is required. Pass symbol_name to find a definition, or file_path to list all symbols in a file.',
				)
			}

			// File overview mode
			if (file_path) {
				const result = await executeIndexOverview(file_path, index_path)
				if ('isError' in result && result.isError) {
					throw new Error(result.error)
				}
				return formatIndexOverviewResults(result, format)
			}

			// Symbol lookup mode
			const result = await executeIndexFind(symbol_name!, index_path)
			if ('isError' in result && result.isError) {
				throw new Error(result.error)
			}
			return formatIndexFindResults(result, format)
		},
		{
			toolName: 'kit_find',
			logger: symbolsAdapter,
			createCid: createCorrelationId,
		},
	),
)

// ============================================================================
// 3. kit_references - Callers + usages (merged)
// ============================================================================

tool(
	'kit_references',
	{
		description: `Find all references to a symbol -- call sites, usages, and definitions.

Three modes:
- all (default): Find all references (definitions + call sites + type usages)
- callers_only: Only call sites (filters out definitions)
- definitions_only: Only definition locations

Uses PROJECT_INDEX.json + grep for callers, Kit CLI for usages.

Requires Kit CLI: uv tool install cased-kit`,
		inputSchema: {
			symbol: z
				.string()
				.describe('Symbol name to find references for. Example: "executeFind"'),
			mode: z
				.enum(['all', 'callers_only', 'definitions_only'])
				.optional()
				.describe(
					"Reference mode: 'all' (default), 'callers_only', or 'definitions_only'",
				),
			symbol_type: z
				.string()
				.optional()
				.describe(
					'Filter by symbol type (for usages mode): "function", "class", "type", etc.',
				),
			path: z
				.string()
				.optional()
				.describe('Repository path to search (default: current directory)'),
			response_format: z
				.enum(['markdown', 'json'])
				.optional()
				.default('json')
				.describe("Output format: 'markdown' or 'json' (default)"),
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	wrapToolHandler(
		async (args, format) => {
			const {
				symbol,
				mode = 'all',
				symbol_type,
				path,
			} = args as {
				symbol: string
				mode?: 'all' | 'callers_only' | 'definitions_only'
				symbol_type?: string
				path?: string
			}

			if (mode === 'callers_only') {
				// Validate symbol for callers mode (allowlist valid identifiers)
				const trimmed = symbol.trim()
				if (!trimmed) {
					throw new Error('symbol is required and cannot be empty')
				}
				if (!/^[a-zA-Z_$][a-zA-Z0-9_$.<>#]*$/.test(trimmed)) {
					throw new Error(
						'symbol must be a valid identifier (letters, numbers, _, $, ., <, >, #)',
					)
				}

				// Call library function directly instead of spawning CLI
				// Uses kit grep to find all occurrences, then filters to call sites only
				const grepResult = executeKitGrep({
					pattern: trimmed,
					path,
					caseSensitive: true,
					maxResults: 500,
				})

				// Handle error result
				if ('error' in grepResult) {
					throw new Error(
						`${grepResult.error}${grepResult.hint ? `\nHint: ${grepResult.hint}` : ''}`,
					)
				}

				// Filter out definition patterns to show only call sites
				// Heuristics: exclude lines that look like function declarations or assignments
				const definitionPatterns = [
					/^function\s+/, // function declarations
					/^export\s+(async\s+)?function\s+/, // exported functions
					/^(const|let|var)\s+\w+\s*=\s*function/, // function expressions
					/^(const|let|var)\s+\w+\s*=\s*\(/, // arrow functions
					/^(const|let|var)\s+\w+\s*=\s*async\s*\(/, // async arrow functions
					/^async\s+function\s+/, // async function declarations
				]

				const callSites = grepResult.matches.filter((match) => {
					const content = match.content.trim()
					return !definitionPatterns.some((pattern) => pattern.test(content))
				})

				// Build callers result in same format as CLI command
				const callersResult = {
					functionName: trimmed,
					callSites: callSites.map((m) => ({
						file: m.file,
						line: m.line || 0,
						context: m.content,
					})),
					count: callSites.length,
				}

				// Format output
				if (format === ResponseFormat.JSON) {
					return JSON.stringify(callersResult, null, 2)
				}

				// Markdown format
				let markdown = `## Call Sites\n\n`
				markdown += `**Function:** \`${trimmed}\`\n`
				markdown += `**Call sites found:** ${callersResult.count}\n\n`

				if (callersResult.count === 0) {
					markdown += '_No call sites found_\n'
				} else {
					// Group by file
					const byFile = new Map<string, typeof callSites>()
					for (const site of callSites) {
						if (!byFile.has(site.file)) {
							byFile.set(site.file, [])
						}
						byFile.get(site.file)?.push(site)
					}

					for (const [file, sites] of byFile.entries()) {
						markdown += `### ${file}\n\n`
						for (const site of sites) {
							markdown += `- Line ${site.line || '?'}: \`${site.content.trim()}\`\n`
						}
						markdown += '\n'
					}
				}

				return markdown
			}

			// Validate inputs for usages modes
			const validation = validateUsagesInputs({
				symbolName: symbol,
				symbolType: symbol_type,
				path,
			})
			if (!validation.valid) {
				throw new Error(validation.errors.join('; '))
			}

			// For "all" and "definitions_only", use Kit usages
			const result = executeKitUsages({
				symbolName: validation.validated!.symbolName,
				symbolType: validation.validated!.symbolType,
				path: validation.validated!.path,
			})

			if ('error' in result) {
				throw new Error(
					`${result.error}${result.hint ? `\nHint: ${result.hint}` : ''}`,
				)
			}

			// Filter to definitions only if requested
			if (mode === 'definitions_only') {
				result.usages = result.usages.filter(
					(u) => u.type === 'definition' || u.type === 'export',
				)
				result.count = result.usages.length
			}

			if (format === ResponseFormat.JSON) {
				return JSON.stringify(result, null, 2)
			}

			// Format as markdown
			let markdown = `## Symbol References\n\n`
			markdown += `**Symbol:** \`${result.symbolName}\`\n`
			markdown += `**Mode:** ${mode}\n`
			markdown += `**References found:** ${result.count}\n\n`

			if (result.usages.length === 0) {
				markdown += '_No references found_\n'
			} else {
				for (const usage of result.usages) {
					markdown += `### ${usage.file}${usage.line ? `:${usage.line}` : ''}\n`
					markdown += `**Type:** \`${usage.type}\` | **Name:** \`${usage.name}\`\n`
					if (usage.context) {
						markdown += `\`\`\`\n${usage.context}\n\`\`\`\n`
					}
					markdown += '\n'
				}
			}

			return markdown
		},
		{
			toolName: 'kit_references',
			logger: referencesAdapter,
			createCid: createCorrelationId,
		},
	),
)

// ============================================================================
// 4. kit_semantic - Vector search with grep fallback
// ============================================================================

tool(
	'kit_semantic',
	{
		description: `Semantic search using natural language queries and vector embeddings.

Find code by meaning rather than exact text matches. Great for:
- "How does authentication work?"
- "Error handling patterns"
- "Database connection logic"

NOTE: Requires ML dependencies. If unavailable, falls back to text search.
To enable: uv tool install 'cased-kit[ml]'`,
		inputSchema: {
			query: z
				.string()
				.describe(
					'Natural language query. Example: "authentication flow logic"',
				),
			path: z
				.string()
				.optional()
				.describe('Repository path to search (default: current directory)'),
			top_k: z
				.number()
				.optional()
				.describe('Number of results to return (default: 5, max: 50)'),
			chunk_by: z
				.enum(['symbols', 'lines'])
				.optional()
				.describe("Chunking strategy: 'symbols' (default) or 'lines'"),
			build_index: z
				.boolean()
				.optional()
				.describe('Force rebuild of vector index (default: false)'),
			response_format: z
				.enum(['markdown', 'json'])
				.optional()
				.default('json')
				.describe("Output format: 'markdown' or 'json' (default)"),
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	wrapToolHandler(
		async (args, format) => {
			const { query, path, top_k, chunk_by, build_index } = args as {
				query: string
				path?: string
				top_k?: number
				chunk_by?: 'symbols' | 'lines'
				build_index?: boolean
			}

			// Validate semantic search inputs
			const validation = validateSemanticInputs({ query, path, topK: top_k })
			if (!validation.valid) {
				throw new Error(validation.errors.join('; '))
			}

			// Call library function directly instead of spawning CLI
			const result = executeKitSemantic({
				query: validation.validated!.query,
				path: validation.validated!.path,
				topK: validation.validated!.topK,
				chunkBy: chunk_by,
				buildIndex: build_index,
			})

			// Handle error result
			if ('error' in result) {
				throw new Error(
					`${result.error}${result.hint ? `\nHint: ${result.hint}` : ''}`,
				)
			}

			// Format result using existing formatter
			return formatSemanticResults(result, format)
		},
		{
			toolName: 'kit_semantic',
			logger: semanticAdapter,
			createCid: createCorrelationId,
		},
	),
)

// ============================================================================
// 5. kit_ast_search - Tree-sitter structural search
// ============================================================================

tool(
	'kit_ast_search',
	{
		description: `AST pattern search using tree-sitter for structural code matching.

Find code by structure rather than text. More precise than grep for:
- "async function" - Find all async functions
- "try catch" - Find try-catch blocks
- "React hooks" - Find useState/useEffect calls
- "class extends" - Find class inheritance

Supports TypeScript, JavaScript, and Python.

Two modes:
- simple (default): Natural language patterns like "async function"
- pattern: JSON criteria like {"type": "function_declaration", "async": true}`,
		inputSchema: {
			pattern: z
				.string()
				.describe(
					'Search pattern. Simple mode: "async function", "try catch". Pattern mode: {"type": "function_declaration"}',
				),
			mode: z
				.enum(['simple', 'pattern'])
				.optional()
				.describe(
					"Search mode: 'simple' (default) for natural language, 'pattern' for JSON criteria",
				),
			file_pattern: z
				.string()
				.optional()
				.describe(
					'File glob pattern to search (default: all supported files). Example: "*.ts"',
				),
			path: z
				.string()
				.optional()
				.describe('Repository path to search (default: current directory)'),
			max_results: z
				.number()
				.optional()
				.describe('Maximum results to return (default: 100)'),
			response_format: z
				.enum(['markdown', 'json'])
				.optional()
				.default('json')
				.describe("Output format: 'markdown' or 'json' (default)"),
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	wrapToolHandler(
		async (args, format) => {
			const { pattern, mode, file_pattern, path, max_results } = args as {
				pattern: string
				mode?: 'simple' | 'pattern'
				file_pattern?: string
				path?: string
				max_results?: number
			}

			// Validate AST search inputs
			const validation = validateAstSearchInputs({
				pattern,
				mode,
				filePattern: file_pattern,
				path,
				maxResults: max_results,
			})
			if (!validation.valid) {
				throw new Error(validation.errors.join('; '))
			}

			const result = await executeAstSearch({
				pattern: validation.validated!.pattern,
				mode:
					validation.validated!.mode === 'pattern'
						? SearchMode.PATTERN
						: SearchMode.SIMPLE,
				filePattern: validation.validated!.filePattern,
				path: validation.validated!.path,
				maxResults: validation.validated!.maxResults,
			})

			if ('error' in result) {
				throw new Error(
					`${result.error}${result.hint ? `\nHint: ${result.hint}` : ''}`,
				)
			}

			if (format === ResponseFormat.JSON) {
				return JSON.stringify(result, null, 2)
			}

			let markdown = `## AST Search Results\n\n`
			markdown += `**Pattern:** \`${result.pattern}\`\n`
			markdown += `**Mode:** ${result.mode}\n`
			markdown += `**Matches:** ${result.count}\n\n`

			if (result.matches.length === 0) {
				markdown += '_No matches found_\n'
			} else {
				for (const match of result.matches) {
					markdown += `### ${match.file}:${match.line}\n`
					markdown += `**Node type:** \`${match.nodeType}\`\n`
					if (match.context.parentFunction) {
						markdown += `**In function:** \`${match.context.parentFunction}\`\n`
					}
					if (match.context.parentClass) {
						markdown += `**In class:** \`${match.context.parentClass}\`\n`
					}
					markdown += `\`\`\`\n${match.text.slice(0, 300)}${match.text.length > 300 ? '...' : ''}\n\`\`\`\n\n`
				}
			}

			return markdown
		},
		{
			toolName: 'kit_ast_search',
			logger: astAdapter,
			createCid: createCorrelationId,
		},
	),
)

// ============================================================================
// 6. kit_context - Extract enclosing definition around file:line
// ============================================================================

tool(
	'kit_context',
	{
		description: `Extract the full enclosing definition around a specific line in a file.

Uses Kit CLI to find the complete function/class/method that contains a given line.
Great for:
- Getting full context around a line reference
- Extracting complete function bodies without reading entire files
- Understanding code surrounding a specific location

Requires Kit CLI v3.0+: uv tool install cased-kit`,
		inputSchema: {
			file_path: z
				.string()
				.describe(
					'Relative path to the file within the repository. Example: "src/kit-wrapper.ts"',
				),
			line: z.number().describe('Line number to extract context around'),
			path: z
				.string()
				.optional()
				.describe('Repository path (default: git root or current directory)'),
			response_format: z
				.enum(['markdown', 'json'])
				.optional()
				.default('json')
				.describe("Output format: 'markdown' or 'json' (default)"),
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	wrapToolHandler(
		async (args, format) => {
			const { file_path, line, path } = args as {
				file_path: string
				line: number
				path?: string
			}

			// Validate file_path - no traversal, non-empty, no null bytes, relative only
			const fileTrimmed = file_path.trim()
			if (!fileTrimmed) {
				throw new Error('file_path is required')
			}
			// Reject null bytes
			if (fileTrimmed.includes('\x00')) {
				throw new Error('file_path contains invalid characters')
			}
			// Reject absolute paths
			if (fileTrimmed.startsWith('/') || fileTrimmed.startsWith('\\')) {
				throw new Error('file_path must be a relative path')
			}
			// Normalize and check for directory traversal
			const normalized = fileTrimmed.replace(/\\/g, '/')
			if (normalized.includes('..')) {
				throw new Error('file_path must not contain directory traversal')
			}
			if (line < 1) {
				throw new Error('line must be a positive integer')
			}

			const repoPath = await validatePathOrDefault(path)

			const result = spawnSyncCollect(
				['kit', 'context', repoPath, '--', file_path, String(line)],
				{
					env: { PATH: buildEnhancedPath() },
				},
			)

			if (result.exitCode !== 0) {
				throw new Error(
					result.stderr || `Failed to extract context for ${file_path}:${line}`,
				)
			}

			const output = result.stdout.trim()

			if (format === ResponseFormat.JSON) {
				// Kit context outputs JSON by default
				const parsed = safeJsonParse<Record<string, unknown> | null>(
					output,
					null,
				)
				return parsed
					? JSON.stringify(parsed, null, 2)
					: JSON.stringify({ context: output, file: file_path, line })
			}

			// Markdown format
			let markdown = `## Context for ${file_path}:${line}\n\n`
			const parsed = safeJsonParse<Record<string, unknown> | null>(output, null)
			if (parsed && (parsed.context || parsed.code)) {
				const code = parsed.context || parsed.code || output
				const ext = file_path.split('.').pop() || ''
				const lang = getLanguageForExtension(ext)
				markdown += `\`\`\`${lang}\n${code}\n\`\`\`\n`
			} else {
				markdown += `\`\`\`\n${output}\n\`\`\`\n`
			}

			return markdown
		},
		{
			toolName: 'kit_context',
			logger: contextAdapter,
			createCid: createCorrelationId,
		},
	),
)

// ============================================================================
// 7. kit_chunk - Split file into LLM-friendly chunks
// ============================================================================

tool(
	'kit_chunk',
	{
		description: `Split a file into LLM-friendly chunks for efficient processing.

Two strategies:
- symbols (default): Chunk at function/class boundaries (semantic)
- lines: Chunk by line count (configurable max_lines)

Great for:
- Processing large files piece by piece
- Token-efficient file analysis
- Focused code review on specific sections

Requires Kit CLI v3.0+: uv tool install cased-kit`,
		inputSchema: {
			file_path: z
				.string()
				.describe(
					'Relative path to the file within the repository. Example: "src/kit-wrapper.ts"',
				),
			strategy: z
				.enum(['symbols', 'lines'])
				.optional()
				.describe(
					"Chunking strategy: 'symbols' (default, at function boundaries) or 'lines' (by line count)",
				),
			max_lines: z
				.number()
				.optional()
				.describe(
					"Maximum lines per chunk (only for 'lines' strategy, default: 50)",
				),
			path: z
				.string()
				.optional()
				.describe('Repository path (default: git root or current directory)'),
			response_format: z
				.enum(['markdown', 'json'])
				.optional()
				.default('json')
				.describe("Output format: 'markdown' or 'json' (default)"),
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	wrapToolHandler(
		async (args, format) => {
			const {
				file_path,
				strategy = 'symbols',
				max_lines,
				path,
			} = args as {
				file_path: string
				strategy?: 'symbols' | 'lines'
				max_lines?: number
				path?: string
			}

			// Validate file_path - no traversal, non-empty, no null bytes, relative only
			const fileTrimmed = file_path.trim()
			if (!fileTrimmed) {
				throw new Error('file_path is required')
			}
			// Reject null bytes
			if (fileTrimmed.includes('\x00')) {
				throw new Error('file_path contains invalid characters')
			}
			// Reject absolute paths
			if (fileTrimmed.startsWith('/') || fileTrimmed.startsWith('\\')) {
				throw new Error('file_path must be a relative path')
			}
			// Normalize and check for directory traversal
			const normalized = fileTrimmed.replace(/\\/g, '/')
			if (normalized.includes('..')) {
				throw new Error('file_path must not contain directory traversal')
			}

			// Validate max_lines bounds (1-500)
			if (max_lines !== undefined && (max_lines < 1 || max_lines > 500)) {
				throw new Error('max_lines must be between 1 and 500')
			}

			const repoPath = await validatePathOrDefault(path)

			let cmd: string[]
			if (strategy === 'symbols') {
				cmd = ['kit', 'chunk-symbols', repoPath, '--', file_path]
			} else {
				cmd = ['kit', 'chunk-lines', repoPath]
				if (max_lines) {
					cmd.push('-n', String(max_lines))
				}
				cmd.push('--', file_path)
			}

			const result = spawnSyncCollect(cmd, {
				env: { PATH: buildEnhancedPath() },
			})

			if (result.exitCode !== 0) {
				throw new Error(result.stderr || `Failed to chunk ${file_path}`)
			}

			const output = result.stdout.trim()

			if (format === ResponseFormat.JSON) {
				const parsed = safeJsonParse<Record<string, unknown> | null>(
					output,
					null,
				)
				return parsed
					? JSON.stringify(parsed, null, 2)
					: JSON.stringify({
							file: file_path,
							strategy,
							chunks: [output],
						})
			}

			// Markdown format
			let markdown = `## File Chunks: ${file_path}\n\n`
			markdown += `**Strategy:** ${strategy}\n`

			// biome-ignore lint/suspicious/noExplicitAny: Kit CLI output is dynamic JSON
			const parsed = safeJsonParse<any>(output, null)
			if (parsed) {
				const chunks: Record<string, unknown>[] = Array.isArray(parsed)
					? parsed
					: parsed.chunks || [parsed]
				markdown += `**Chunks:** ${chunks.length}\n\n`

				for (const [i, chunk] of chunks.entries()) {
					markdown += `### Chunk ${i + 1}`
					if (chunk.name || chunk.symbol) {
						markdown += ` - ${chunk.name || chunk.symbol}`
					}
					markdown += '\n'
					if (chunk.start_line || chunk.startLine) {
						markdown += `Lines ${chunk.start_line || chunk.startLine}-${chunk.end_line || chunk.endLine}\n`
					}
					const code =
						chunk.content || chunk.code || chunk.text || JSON.stringify(chunk)
					const ext = file_path.split('.').pop() || ''
					const lang = getLanguageForExtension(ext)
					markdown += `\`\`\`${lang}\n${code}\n\`\`\`\n\n`
				}
			} else {
				markdown += `\`\`\`\n${output}\n\`\`\`\n`
			}

			return markdown
		},
		{
			toolName: 'kit_chunk',
			logger: chunkAdapter,
			createCid: createCorrelationId,
		},
	),
)

// ============================================================================
// Start Server
// ============================================================================

if (import.meta.main) {
	startServer('kit', {
		version: '1.0.0',
		fileLogging: {
			enabled: true,
			subsystems: [
				'symbols',
				'references',
				'semantic',
				'ast',
				'context',
				'chunk',
			],
			level: 'debug',
		},
	})
}
