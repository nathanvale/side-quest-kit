/**
 * Kit Plugin Logger
 *
 * JSONL logging with LogTape for observability and debugging.
 * Uses @sidequest/core logging factory for consistent log location.
 *
 * Log location: ~/.claude/logs/kit.jsonl
 *
 * Logging Level Convention:
 * - DEBUG: Detailed diagnostic info (file counts, cache hits, parameter echo)
 * - INFO: Normal operation events (start/complete, results summary)
 * - WARN: Degraded operation (fallbacks, skipped files, soft failures)
 * - ERROR: Operation failures (exceptions, command failures, parse errors)
 */

import {
	createCorrelationId,
	createPluginLogger,
} from '@side-quest/core/logging'

const {
	initLogger,
	rootLogger: logger,
	getSubsystemLogger,
	logDir,
	logFile,
} = createPluginLogger({
	name: 'kit',
	subsystems: [
		'grep',
		'semantic',
		'usages',
		'ast',
		'symbols',
		'references',
		'context',
		'chunk',
	],
})

// ============================================================================
// Exports
// ============================================================================

export { createCorrelationId, initLogger, logDir, logFile, logger }

/** Grep subsystem logger */
export const grepLogger = getSubsystemLogger('grep')

/** Semantic search subsystem logger */
export const semanticLogger = getSubsystemLogger('semantic')

/** Usages subsystem logger */
export const usagesLogger = getSubsystemLogger('usages')

/** AST search subsystem logger */
export const astLogger = getSubsystemLogger('ast')

/** Symbols subsystem logger */
export const symbolsLogger = getSubsystemLogger('symbols')

/** References subsystem logger */
export const referencesLogger = getSubsystemLogger('references')

/** Context subsystem logger */
export const contextLogger = getSubsystemLogger('context')

/** Chunk subsystem logger */
export const chunkLogger = getSubsystemLogger('chunk')

// ============================================================================
// Legacy getter functions (for backwards compatibility)
// ============================================================================

/** @deprecated Use astLogger directly */
export function getAstLogger() {
	return astLogger
}
