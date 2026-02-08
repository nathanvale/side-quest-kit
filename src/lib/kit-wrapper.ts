/**
 * Kit CLI Wrapper
 *
 * Pure functions for executing Kit CLI commands with proper error handling.
 * Uses Bun.spawnSync via shared helpers for synchronous execution to fit MCP tool patterns.
 */

import { join } from 'node:path'
import { TimeoutError, withTimeout } from '@side-quest/core/concurrency'
import {
	ensureCacheDir,
	isCachePopulated,
	withTempJsonFileSync,
} from '@side-quest/core/fs'
import {
	buildEnhancedPath,
	ensureCommandAvailable,
	spawnSyncCollect,
} from '@side-quest/core/spawn'

import { safeJsonParse } from '@side-quest/core/utils'
import {
	AST_SEARCH_TIMEOUT,
	ASTSearcher,
	type ASTSearchOptions,
	type ASTSearchResult,
} from './ast/index.js'
import {
	createErrorFromOutput,
	isSemanticUnavailableError,
	isTimeoutError,
	KitError,
	KitErrorType,
	SEMANTIC_INSTALL_HINT,
} from './errors.js'
import {
	astLogger,
	createCorrelationId,
	grepLogger,
	semanticLogger,
	usagesLogger,
} from './logger.js'
import type {
	GrepMatch,
	GrepOptions,
	GrepResult,
	KitResult,
	SemanticMatch,
	SemanticOptions,
	SemanticResult,
	SymbolUsage,
	UsagesOptions,
	UsagesResult,
} from './types.js'
import {
	GREP_TIMEOUT,
	getDefaultKitPath,
	SEMANTIC_TIMEOUT,
	USAGES_TIMEOUT,
} from './types.js'

// ============================================================================
// Kit CLI Execution
// ============================================================================

/**
 * Check if Kit CLI is installed and available in PATH.
 * @returns True if kit command is available
 */
export function isKitInstalled(): boolean {
	try {
		ensureCommandAvailable('kit')
		return true
	} catch {
		return false
	}
}

/**
 * Get Kit CLI version.
 * @returns Version string or null if not installed
 */
export function getKitVersion(): string | null {
	try {
		const result = spawnSyncCollect(['kit', '--version'], {
			env: {
				...process.env,
				PATH: buildEnhancedPath(),
			},
		})
		if (result.exitCode === 0 && result.stdout) {
			return result.stdout.trim()
		}
		return null
	} catch {
		return null
	}
}

/**
 * Execute a Kit CLI command.
 * @param args - Arguments to pass to kit
 * @param options - Execution options
 * @returns Execution result with stdout, stderr, and exit code
 */
function executeKit(
	args: string[],
	options: {
		timeout?: number
		cwd?: string
	} = {},
): { stdout: string; stderr: string; exitCode: number } {
	const { cwd } = options

	const result = spawnSyncCollect(['kit', ...args], {
		env: {
			...process.env,
			PATH: buildEnhancedPath(),
		},
		...(cwd && { cwd }),
	})

	return {
		stdout: result.stdout || '',
		stderr: result.stderr || '',
		exitCode: result.exitCode ?? 1,
	}
}

// ============================================================================
// Grep Execution
// ============================================================================

/**
 * Raw grep match as returned by Kit CLI.
 */
interface RawGrepMatch {
	file: string
	line_number: number
	line_content: string
}

/**
 * Execute kit grep command.
 * @param options - Grep options
 * @returns Grep result or error
 */
export function executeKitGrep(options: GrepOptions): KitResult<GrepResult> {
	const cid = createCorrelationId()
	const startTime = Date.now()

	// Check if Kit is installed
	if (!isKitInstalled()) {
		grepLogger.error('Kit not installed', { cid })
		return new KitError(KitErrorType.KitNotInstalled).toJSON()
	}

	const {
		pattern,
		path = getDefaultKitPath(),
		caseSensitive = true,
		include,
		exclude,
		maxResults = 100,
		directory,
	} = options

	// Build command arguments
	const args: string[] = ['grep', path, pattern]

	// Add options
	if (!caseSensitive) {
		args.push('--ignore-case')
	}

	if (include) {
		args.push('--include', include)
	}

	if (exclude) {
		args.push('--exclude', exclude)
	}

	args.push('--max-results', String(maxResults))

	if (directory) {
		args.push('--directory', directory)
	}

	grepLogger.info('Executing kit grep', {
		cid,
		pattern,
		path,
		args,
	})

	try {
		// Use temp file for JSON output with automatic cleanup
		const rawMatches = withTempJsonFileSync<RawGrepMatch[]>(
			`kit-grep-${cid}`,
			(tempFile) => {
				args.push('--output', tempFile)
				const result = executeKit(args, { timeout: GREP_TIMEOUT })
				return {
					exitCode: result.exitCode,
					stderr: result.stderr,
				}
			},
		)

		// Transform to our format
		const matches: GrepMatch[] = rawMatches.map((m) => ({
			file: m.file,
			line: m.line_number,
			content: m.line_content,
		}))

		grepLogger.info('Grep completed', {
			cid,
			pattern,
			matchCount: matches.length,
			durationMs: Date.now() - startTime,
		})

		return {
			count: matches.length,
			matches,
			pattern,
			path,
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		grepLogger.error('Grep threw exception', { cid, error: message })

		// Check if this is a Kit CLI error from withTempJsonFileSync
		if (message.includes('Operation failed with exit code')) {
			const exitCode = Number.parseInt(
				message.match(/exit code (\d+)/)?.[1] || '1',
				10,
			)
			const stderr = message.split(': ').slice(2).join(': ') || message
			return createErrorFromOutput(stderr, exitCode).toJSON()
		}

		return new KitError(KitErrorType.KitCommandFailed, message).toJSON()
	}
}

// ============================================================================
// Semantic Search Execution
// ============================================================================

/**
 * Raw semantic match as returned by Kit CLI.
 */
interface RawSemanticMatch {
	file: string
	code: string
	name?: string
	type?: string
	score: number
	start_line?: number
	end_line?: number
}

/**
 * Execute kit semantic search command.
 * @param options - Semantic search options
 * @returns Semantic result or error (with fallback to grep)
 */
export function executeKitSemantic(
	options: SemanticOptions,
): KitResult<SemanticResult> {
	const cid = createCorrelationId()
	const startTime = Date.now()

	// Check if Kit is installed
	if (!isKitInstalled()) {
		semanticLogger.error('Kit not installed', { cid })
		return new KitError(KitErrorType.KitNotInstalled).toJSON()
	}

	const {
		query,
		path = getDefaultKitPath(),
		topK = 5,
		chunkBy = 'symbols',
		buildIndex = false,
	} = options

	// Pre-flight check: if index not built and not forcing build, tell user to build it first
	if (!buildIndex && !isSemanticIndexBuilt(path)) {
		semanticLogger.info('Semantic index not built, instructing user to build', {
			cid,
			path,
		})

		const buildCommand = `kit search-semantic "${path}" "${query}" --build-index`
		const error = new KitError(
			KitErrorType.SemanticIndexNotBuilt,
			`To use semantic search, build the vector index with:\n\n  ${buildCommand}\n\nAfter building (one-time), semantic search will be fast and cached.`,
		)
		return error.toJSON()
	}

	// Get global cache directory for this repo's vector index
	const persistDir = getSemanticCacheDir(path)

	// Build command arguments
	const args: string[] = [
		'search-semantic',
		path,
		query,
		'--top-k',
		String(topK),
		'--format',
		'json',
		'--chunk-by',
		chunkBy,
		'--persist-dir',
		persistDir,
	]

	if (buildIndex) {
		args.push('--build-index')
	}

	semanticLogger.info('Executing kit semantic search', {
		cid,
		query,
		path,
		topK,
		chunkBy,
		persistDir,
	})

	try {
		const result = executeKit(args, { timeout: SEMANTIC_TIMEOUT })

		// Check for semantic search unavailable (ML deps not installed)
		// Note: kit writes error messages to stdout, not stderr
		const combinedOutput = `${result.stdout}\n${result.stderr}`
		if (result.exitCode !== 0 && isSemanticUnavailableError(combinedOutput)) {
			semanticLogger.warn('Semantic search unavailable, falling back to grep', {
				cid,
				output: combinedOutput.slice(0, 200),
			})

			// Fall back to grep search
			return fallbackToGrep(query, path, topK, cid)
		}

		// Check for timeout - DO NOT fall back to grep as it would also timeout
		if (result.exitCode !== 0 && isTimeoutError(combinedOutput)) {
			semanticLogger.warn('Semantic search timed out on large repository', {
				cid,
				query,
				durationMs: Date.now() - startTime,
			})
			return new KitError(
				KitErrorType.Timeout,
				`Semantic search timed out after ${SEMANTIC_TIMEOUT}ms. On first run, building the vector index may take longer. Try again to use the cached index.`,
			).toJSON()
		}

		// Check for other errors
		if (result.exitCode !== 0) {
			semanticLogger.error('Semantic search failed', {
				cid,
				exitCode: result.exitCode,
				output: combinedOutput.slice(0, 500),
				durationMs: Date.now() - startTime,
			})
			return createErrorFromOutput(combinedOutput, result.exitCode).toJSON()
		}

		// Parse JSON output
		const rawMatches = safeJsonParse<RawSemanticMatch[] | null>(
			result.stdout,
			null,
		)
		if (!rawMatches) {
			semanticLogger.error('Failed to parse semantic output', {
				cid,
				stdout: result.stdout,
			})
			return new KitError(
				KitErrorType.OutputParseError,
				'Failed to parse semantic search JSON output',
			).toJSON()
		}

		// Transform to our format
		const matches: SemanticMatch[] = rawMatches.map((m) => ({
			file: m.file,
			chunk: m.code,
			score: m.score,
			startLine: m.start_line,
			endLine: m.end_line,
		}))

		semanticLogger.info('Semantic search completed', {
			cid,
			query,
			matchCount: matches.length,
			durationMs: Date.now() - startTime,
		})

		return {
			count: matches.length,
			matches,
			query,
			path,
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		semanticLogger.error('Semantic search threw exception', {
			cid,
			error: message,
		})
		return new KitError(KitErrorType.KitCommandFailed, message).toJSON()
	}
}

/**
 * Fall back to grep when semantic search is unavailable.
 */
function fallbackToGrep(
	query: string,
	path: string,
	limit: number,
	cid: string,
): KitResult<SemanticResult> {
	// Extract keywords from the query for grep
	const keywords = query
		.split(/\s+/)
		.filter((w) => w.length > 2)
		.slice(0, 3)

	const pattern = keywords.join('|')

	semanticLogger.info('Fallback grep search', { cid, pattern, path })

	const grepResult = executeKitGrep({
		pattern,
		path,
		maxResults: limit,
		caseSensitive: false,
	})

	if ('error' in grepResult) {
		return grepResult
	}

	// Convert grep matches to semantic format
	// Score decreases by 0.05 per result, with minimum of 0.1 to avoid negative scores
	const matches: SemanticMatch[] = grepResult.matches.map((m, idx) => ({
		file: m.file,
		chunk: m.content,
		score: Math.max(0.1, 1 - idx * 0.05),
		startLine: m.line,
		endLine: m.line,
	}))

	return {
		count: matches.length,
		matches,
		query,
		path,
		fallback: true,
		installHint: SEMANTIC_INSTALL_HINT,
	}
}

// ============================================================================
// Symbol Usages Execution
// ============================================================================

/**
 * Raw symbol usage as returned by Kit CLI.
 */
interface RawSymbolUsage {
	file: string
	type: string
	name: string
	line: number | null
	context: string | null
}

/**
 * Execute kit usages command to find symbol definitions.
 * @param options - Usages options
 * @returns Usages result or error
 */
export function executeKitUsages(
	options: UsagesOptions,
): KitResult<UsagesResult> {
	const cid = createCorrelationId()
	const startTime = Date.now()

	// Check if Kit is installed
	if (!isKitInstalled()) {
		usagesLogger.error('Kit not installed', { cid })
		return new KitError(KitErrorType.KitNotInstalled).toJSON()
	}

	const { path = getDefaultKitPath(), symbolName, symbolType } = options

	if (!symbolName || symbolName.trim() === '') {
		return new KitError(
			KitErrorType.InvalidInput,
			'Symbol name is required',
		).toJSON()
	}

	// Build command arguments
	const args: string[] = ['usages', path, symbolName.trim()]

	if (symbolType) {
		args.push('--type', symbolType)
	}

	usagesLogger.info('Executing kit usages', {
		cid,
		path,
		symbolName,
		symbolType,
		args,
	})

	try {
		// Use temp file for JSON output with automatic cleanup
		const rawUsages = withTempJsonFileSync<RawSymbolUsage[]>(
			`kit-usages-${cid}`,
			(tempFile) => {
				const argsWithOutput = [...args, '--output', tempFile]
				const result = executeKit(argsWithOutput, { timeout: USAGES_TIMEOUT })
				return {
					exitCode: result.exitCode,
					stderr: result.stderr,
				}
			},
		)

		// Transform to our format
		const usages: SymbolUsage[] = rawUsages.map((u) => ({
			file: u.file,
			type: u.type,
			name: u.name,
			line: u.line,
			context: u.context,
		}))

		usagesLogger.info('Usages completed', {
			cid,
			symbolName,
			usageCount: usages.length,
			durationMs: Date.now() - startTime,
		})

		return {
			count: usages.length,
			usages,
			symbolName: symbolName.trim(),
			path,
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		usagesLogger.error('Usages threw exception', { cid, error: message })

		// Check if this is a Kit CLI error from withTempJsonFileSync
		if (message.includes('Operation failed with exit code')) {
			const exitCode = Number.parseInt(
				message.match(/exit code (\d+)/)?.[1] || '1',
				10,
			)
			const stderr = message.split(': ').slice(2).join(': ') || message
			return createErrorFromOutput(stderr, exitCode).toJSON()
		}

		return new KitError(KitErrorType.KitCommandFailed, message).toJSON()
	}
}

// ============================================================================
// AST Search Execution (tree-sitter powered)
// ============================================================================

/**
 * Execute AST-based code search using tree-sitter.
 *
 * Unlike other Kit commands, this uses an internal tree-sitter
 * implementation rather than shelling out to the Kit CLI.
 *
 * @param options - AST search options
 * @returns AST search result or error
 */
export async function executeAstSearch(
	options: ASTSearchOptions,
): Promise<KitResult<ASTSearchResult>> {
	const cid = createCorrelationId()
	const startTime = Date.now()

	const { pattern, mode, filePattern, path, maxResults } = options

	astLogger.info('Executing AST search', {
		cid,
		pattern,
		mode,
		filePattern,
		path,
		maxResults,
	})

	try {
		const searcher = new ASTSearcher(path)

		// Use core timeout utility
		const result = await withTimeout(
			searcher.searchPattern(options),
			AST_SEARCH_TIMEOUT,
			'AST search timed out',
		)

		astLogger.info('AST search completed', {
			cid,
			pattern,
			matchCount: result.count,
			durationMs: Date.now() - startTime,
		})

		return result
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		const timeoutInfo =
			error instanceof TimeoutError ? ` after ${error.timeoutMs}ms` : ''
		astLogger.error('AST search failed', {
			cid,
			error: message + timeoutInfo,
		})
		return new KitError(KitErrorType.KitCommandFailed, message).toJSON()
	}
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get the persist directory for a repo's semantic search vector index.
 * Creates the directory if it doesn't exist.
 *
 * Per-repo caching strategy: Each repository gets its own .kit/vector_db/
 * directory for isolated, portable vector indexes. This ensures:
 * - Cache is scoped to the repo being searched
 * - No cross-contamination between different repos
 * - Cache travels with the repo context in Claude Code sessions
 * - Easy cleanup (delete .kit/ when done with project)
 *
 * Structure: <repo-path>/.kit/vector_db/
 *
 * @param repoPath - Absolute path to the repository
 * @returns Path to the persist directory for this repo's vector index
 */
export function getSemanticCacheDir(repoPath: string): string {
	return ensureCacheDir(repoPath, 'vector_db')
}

/**
 * Check if semantic search vector index has been built for a repository.
 * @param repoPath - Path to the repository
 * @returns True if vector index exists and has been built
 */
export function isSemanticIndexBuilt(repoPath: string): boolean {
	const cacheDir = join(repoPath, '.kit', 'vector_db')
	return isCachePopulated(cacheDir)
}
