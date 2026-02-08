/**
 * Kit Plugin Type Definitions
 *
 * Shared types for the Kit MCP server and CLI wrapper.
 */

// ============================================================================
// Response Format
// ============================================================================

/**
 * Re-export OutputFormat from core as ResponseFormat for backwards compatibility.
 * Core's OutputFormat is the canonical enum with identical values ('markdown' | 'json').
 */
export { OutputFormat as ResponseFormat } from '@side-quest/core/formatters'

// ============================================================================
// Grep Types
// ============================================================================

/**
 * A single grep match result.
 */
export interface GrepMatch {
	/** Relative file path from repository root */
	file: string
	/** Line number (1-indexed) */
	line?: number
	/** Matched line content */
	content: string
}

/**
 * Result of a grep search operation.
 */
export interface GrepResult {
	/** Number of matches found */
	count: number
	/** Array of match objects */
	matches: GrepMatch[]
	/** Search pattern used */
	pattern: string
	/** Repository path searched */
	path: string
}

/**
 * Options for grep search.
 */
export interface GrepOptions {
	/** Search pattern (text or regex) */
	pattern: string
	/** Repository path to search */
	path?: string
	/** Case-sensitive search (default: true) */
	caseSensitive?: boolean
	/** File pattern to include (e.g., "*.py") */
	include?: string
	/** File pattern to exclude */
	exclude?: string
	/** Maximum results to return (default: 100) */
	maxResults?: number
	/** Subdirectory to search within */
	directory?: string
}

// ============================================================================
// Semantic Search Types
// ============================================================================

/**
 * A single semantic search match.
 */
export interface SemanticMatch {
	/** Relative file path */
	file: string
	/** Code chunk that matched */
	chunk: string
	/** Relevance score (higher = more relevant) */
	score: number
	/** Start line of the chunk */
	startLine?: number
	/** End line of the chunk */
	endLine?: number
}

/**
 * Result of a semantic search operation.
 */
export interface SemanticResult {
	/** Number of matches found */
	count: number
	/** Array of semantic matches */
	matches: SemanticMatch[]
	/** Natural language query used */
	query: string
	/** Repository path searched */
	path: string
	/** Whether results came from fallback grep */
	fallback?: boolean
	/** Install hint if semantic search unavailable */
	installHint?: string
}

/**
 * Options for semantic search.
 */
export interface SemanticOptions {
	/** Natural language query */
	query: string
	/** Repository path to search */
	path?: string
	/** Number of results to return (default: 5) */
	topK?: number
	/** Chunking strategy: 'symbols' or 'lines' */
	chunkBy?: 'symbols' | 'lines'
	/** Force rebuild of vector index */
	buildIndex?: boolean
}

// ============================================================================
// Symbol Usages Types
// ============================================================================

/**
 * A symbol usage/definition found by Kit.
 */
export interface SymbolUsage {
	/** File containing the symbol */
	file: string
	/** Symbol type (function, class, variable, etc.) */
	type: string
	/** Symbol name */
	name: string
	/** Line number (may be null in current Kit version) */
	line: number | null
	/** Context around the usage */
	context: string | null
}

/**
 * Result of a symbol usages search.
 */
export interface UsagesResult {
	/** Number of usages found */
	count: number
	/** Array of symbol usages */
	usages: SymbolUsage[]
	/** Symbol name searched for */
	symbolName: string
	/** Repository path searched */
	path: string
}

/**
 * Options for symbol usages search.
 */
export interface UsagesOptions {
	/** Repository path */
	path?: string
	/** Symbol name to find usages for */
	symbolName: string
	/** Filter by symbol type (function, class, etc.) */
	symbolType?: string
}

// ============================================================================
// Generic Result Types
// ============================================================================

/**
 * Error result type.
 */
export interface ErrorResult {
	/** Error message */
	error: string
	/** Optional recovery hint */
	hint?: string
}

/**
 * Generic result type that can be success or error.
 */
export type KitResult<T> = T | ErrorResult

/**
 * Type guard for error results.
 */
export function isError<T extends object>(
	result: KitResult<T>,
): result is ErrorResult {
	return typeof result === 'object' && result !== null && 'error' in result
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Environment variable name for configuring default path */
export const KIT_DEFAULT_PATH_ENV = 'KIT_DEFAULT_PATH'

/**
 * Get the default path for Kit operations using cascading defaults:
 * 1. KIT_DEFAULT_PATH environment variable (if set)
 * 2. Current working directory (process.cwd())
 *
 * @returns Resolved default path for Kit operations
 */
export function getDefaultKitPath(): string {
	return process.env[KIT_DEFAULT_PATH_ENV] || process.cwd()
}

/** Default timeout for grep operations (ms) */
export const GREP_TIMEOUT = 30000

/** Default timeout for semantic operations (ms) */
export const SEMANTIC_TIMEOUT = 60000

/** Default timeout for symbol usages operations (ms) */
export const USAGES_TIMEOUT = 45000

/** Default max results for grep */
export const DEFAULT_MAX_RESULTS = 100

/** Default top-k for semantic search */
export const DEFAULT_TOP_K = 5
