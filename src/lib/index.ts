/**
 * Kit Plugin
 *
 * MCP server integrating Kit CLI for semantic search,
 * symbol usages, and AST search. Provides intelligent code search
 * capabilities for the Obsidian vault and other codebases.
 */

// ============================================================================
// Types
// ============================================================================

export type { SupportedLanguage } from './ast/languages.js'
export type {
	ASTMatch,
	ASTMatchContext,
	ASTSearchOptions,
	ASTSearchResult,
	PatternCriteria,
} from './ast/types.js'
export { SearchMode } from './ast/types.js'
export type {
	ErrorResult,
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
export { isError, ResponseFormat } from './types.js'

// ============================================================================
// Errors
// ============================================================================

export { detectErrorType, KitError, KitErrorType } from './errors.js'

// ============================================================================
// Functions - Kit Wrapper
// ============================================================================

export {
	executeAstSearch,
	executeKitGrep,
	executeKitSemantic,
	executeKitUsages,
	getKitVersion,
	isKitInstalled,
} from './kit-wrapper.js'

// ============================================================================
// Functions - Index Tools
// ============================================================================

export {
	executeIndexFind,
	executeIndexOverview,
	executeIndexPrime,
	formatIndexFindResults,
	formatIndexOverviewResults,
	formatIndexPrimeResults,
	type IndexError,
	type IndexFindResult,
	type IndexOverviewResult,
	type IndexPrimeExistsResult,
	type IndexPrimeResult,
	type IndexStatsResult,
} from './index-tools.js'

// ============================================================================
// Functions - AST Search
// ============================================================================

export {
	ASTPattern,
	ASTSearcher,
	detectLanguage,
	getParser,
	getSupportedGlob,
	initParser,
	isSupported,
	LANGUAGES,
	SUPPORTED_LANGUAGES,
} from './ast/index.js'

// ============================================================================
// Validators
// ============================================================================

export {
	validateAstSearchInputs,
	validatePath,
	validateSemanticInputs,
	validateUsagesInputs,
} from './validators.js'

// ============================================================================
// Formatters
// ============================================================================

export {
	formatError,
	formatSemanticResults,
	formatUsagesResults,
} from './formatters.js'

// ============================================================================
// Logger
// ============================================================================

export { createCorrelationId, initLogger, logger } from './logger.js'

// ============================================================================
// Utils
// ============================================================================

export {
	findGitRoot,
	findGitRootSync,
	getTargetDir,
	resolveRepoPath,
} from './utils/git.js'
