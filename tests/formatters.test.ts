import { describe, expect, test } from 'bun:test'
import { formatError, formatSemanticResults, formatUsagesResults } from '../src/lib/formatters.js'
import {
	formatIndexFindResults,
	formatIndexOverviewResults,
	formatIndexPrimeResults,
	formatIndexStatsResults,
	type IndexError,
	type IndexFindResult,
	type IndexOverviewResult,
	type IndexPrimeExistsResult,
	type IndexPrimeResult,
	type IndexStatsResult,
} from '../src/lib/index-tools.js'
import type { ErrorResult, SemanticResult, UsagesResult } from '../src/lib/types.js'

// ============================================================================
// formatSemanticResults
// ============================================================================

describe('formatSemanticResults', () => {
	const baseResult: SemanticResult = {
		count: 2,
		matches: [
			{
				file: 'src/auth.ts',
				chunk: 'function login() { /* auth logic */ }',
				score: 0.95,
				startLine: 10,
				endLine: 20,
			},
			{
				file: 'src/session.ts',
				chunk: 'class Session {}',
				score: 0.72,
				startLine: 5,
			},
		],
		query: 'authentication flow',
		path: '/repo',
	}

	test('JSON: returns valid JSON with correct fields', () => {
		const output = formatSemanticResults(baseResult, 'json')
		const parsed = JSON.parse(output)
		expect(parsed.count).toBe(2)
		expect(parsed.matches).toHaveLength(2)
		expect(parsed.query).toBe('authentication flow')
		expect(parsed.path).toBe('/repo')
	})

	test('Markdown: includes header and match count', () => {
		const output = formatSemanticResults(baseResult, 'markdown')
		expect(output).toContain('## Semantic Search Results')
		expect(output).toContain('Found **2** matches')
		expect(output).toContain('_"authentication flow"_')
	})

	test('Markdown: shows code blocks with line ranges', () => {
		const output = formatSemanticResults(baseResult, 'markdown')
		expect(output).toContain(':10-20')
		expect(output).toContain('95.0% relevance')
		expect(output).toContain('```')
		expect(output).toContain('function login()')
	})

	test('Markdown: shows startLine only when endLine missing', () => {
		const output = formatSemanticResults(baseResult, 'markdown')
		expect(output).toContain('src/session.ts:5')
	})

	test('empty results: shows no matches message', () => {
		const empty: SemanticResult = {
			count: 0,
			matches: [],
			query: 'nonexistent',
			path: '/repo',
		}
		const output = formatSemanticResults(empty, 'markdown')
		expect(output).toContain('_No matches found._')
	})

	test('error result: delegates to formatError', () => {
		const error: ErrorResult = { error: 'Search failed', hint: 'Try again' }
		const output = formatSemanticResults(error, 'markdown')
		expect(output).toContain('Search failed')
		expect(output).toContain('Try again')
	})

	test('fallback notice shown when result.fallback is true', () => {
		const fallback: SemanticResult = {
			...baseResult,
			fallback: true,
			installHint: 'Install ML deps\nfor full semantic search',
		}
		const output = formatSemanticResults(fallback, 'markdown')
		expect(output).toContain('> **Note:**')
		expect(output).toContain('text search fallback')
	})

	test('truncates long chunks', () => {
		const longChunk: SemanticResult = {
			count: 1,
			matches: [
				{
					file: 'big.ts',
					chunk: 'x'.repeat(1000),
					score: 0.9,
				},
			],
			query: 'test',
			path: '/repo',
		}
		const output = formatSemanticResults(longChunk, 'markdown')
		// truncate(chunk, 500) should limit the chunk
		expect(output.length).toBeLessThan(1000)
	})

	test('defaults to markdown format', () => {
		const output = formatSemanticResults(baseResult)
		expect(output).toContain('## Semantic Search Results')
	})
})

// ============================================================================
// formatUsagesResults
// ============================================================================

describe('formatUsagesResults', () => {
	const baseResult: UsagesResult = {
		count: 2,
		usages: [
			{
				file: 'src/main.ts',
				type: 'function',
				name: 'doStuff',
				line: 42,
				context: 'export function doStuff() {}',
			},
			{
				file: 'src/util.ts',
				type: 'class',
				name: 'Helper',
				line: null,
				context: null,
			},
		],
		symbolName: 'doStuff',
		path: '/repo',
	}

	test('JSON: returns valid JSON with correct fields', () => {
		const output = formatUsagesResults(baseResult, 'json')
		const parsed = JSON.parse(output)
		expect(parsed.count).toBe(2)
		expect(parsed.usages).toHaveLength(2)
		expect(parsed.symbolName).toBe('doStuff')
	})

	test('Markdown: shows icon + type + file + context code blocks', () => {
		const output = formatUsagesResults(baseResult, 'markdown')
		expect(output).toContain('## Symbol Definitions')
		expect(output).toContain('Found **2** definition(s)')
		expect(output).toContain('### 📦 doStuff') // function icon
		expect(output).toContain('- **Type:** function')
		expect(output).toContain('`src/main.ts:42`')
		expect(output).toContain('```')
		expect(output).toContain('export function doStuff()')
	})

	test('Markdown: shows class icon', () => {
		const output = formatUsagesResults(baseResult, 'markdown')
		expect(output).toContain('### 📚 Helper')
	})

	test('Markdown: omits line info when null', () => {
		const output = formatUsagesResults(baseResult, 'markdown')
		// Helper has line: null, so no :lineNumber
		expect(output).toContain('`src/util.ts`')
	})

	test('empty usages: shows no definitions found', () => {
		const empty: UsagesResult = {
			count: 0,
			usages: [],
			symbolName: 'ghost',
			path: '/repo',
		}
		const output = formatUsagesResults(empty, 'markdown')
		expect(output).toContain('_No definitions found._')
	})

	test('error result: delegates to formatError in both formats', () => {
		const error: ErrorResult = { error: 'Kit not installed' }
		expect(formatUsagesResults(error, 'json')).toContain('Kit not installed')
		expect(formatUsagesResults(error, 'markdown')).toContain('Kit not installed')
	})

	test('symbol type to icon mapping covers known types', () => {
		const types = [
			{ type: 'function', icon: '📦' },
			{ type: 'class', icon: '📚' },
			{ type: 'method', icon: '🔧' },
			{ type: 'variable', icon: '📌' },
			{ type: 'type', icon: '📝' },
			{ type: 'interface', icon: '📋' },
			{ type: 'enum', icon: '📊' },
			{ type: 'module', icon: '📁' },
		]

		for (const { type, icon } of types) {
			const result: UsagesResult = {
				count: 1,
				usages: [{ file: 'a.ts', type, name: 'sym', line: 1, context: null }],
				symbolName: 'sym',
				path: '/repo',
			}
			const output = formatUsagesResults(result, 'markdown')
			expect(output).toContain(icon)
		}
	})

	test('unknown symbol type uses bullet fallback', () => {
		const result: UsagesResult = {
			count: 1,
			usages: [
				{
					file: 'a.ts',
					type: 'exotic_type',
					name: 'x',
					line: 1,
					context: null,
				},
			],
			symbolName: 'x',
			path: '/repo',
		}
		const output = formatUsagesResults(result, 'markdown')
		expect(output).toContain('###')
	})
})

// ============================================================================
// formatError
// ============================================================================

describe('formatError', () => {
	test('JSON: returns { error, hint } structure', () => {
		const error: ErrorResult = { error: 'Bad input', hint: 'Check params' }
		const output = formatError(error, 'json')
		const parsed = JSON.parse(output)
		expect(parsed.error).toBe('Bad input')
		expect(parsed.hint).toBe('Check params')
	})

	test('Markdown: shows Error and Hint lines', () => {
		const error: ErrorResult = { error: 'Bad input', hint: 'Check params' }
		const output = formatError(error, 'markdown')
		expect(output).toContain('## Error')
		expect(output).toContain('**Bad input**')
		expect(output).toContain('**Hint:** Check params')
	})

	test('missing hint handled gracefully', () => {
		const error: ErrorResult = { error: 'Bad input' }
		const output = formatError(error, 'markdown')
		expect(output).toContain('**Bad input**')
		expect(output).not.toContain('**Hint:**')
	})

	test('defaults to markdown format', () => {
		const error: ErrorResult = { error: 'test' }
		const output = formatError(error)
		expect(output).toContain('## Error')
	})
})

// ============================================================================
// formatIndexFindResults
// ============================================================================

describe('formatIndexFindResults', () => {
	const exactResult: IndexFindResult = {
		query: 'executeKitGrep',
		matchType: 'exact',
		count: 1,
		results: [
			{
				file: 'src/kit-wrapper.ts',
				name: 'executeKitGrep',
				type: 'function',
				line: 147,
				code: 'export function executeKitGrep(options: GrepOptions)',
			},
		],
	}

	const fuzzyResult: IndexFindResult = {
		query: 'execGrep',
		matchType: 'fuzzy',
		count: 2,
		results: [
			{
				file: 'src/kit-wrapper.ts',
				name: 'executeKitGrep',
				type: 'function',
				line: 147,
				code: 'export function executeKitGrep()',
				score: 0.8,
			},
			{
				file: 'src/kit-wrapper.ts',
				name: 'executeKitSemantic',
				type: 'function',
				line: 270,
				code: 'export function executeKitSemantic()',
				score: 0.5,
			},
		],
	}

	test('JSON: returns valid JSON for exact matches', () => {
		const output = formatIndexFindResults(exactResult, 'json')
		const parsed = JSON.parse(output)
		expect(parsed.query).toBe('executeKitGrep')
		expect(parsed.matchType).toBe('exact')
		expect(parsed.count).toBe(1)
	})

	test('Markdown: shows match count and type for exact', () => {
		const output = formatIndexFindResults(exactResult, 'markdown')
		expect(output).toContain('1 exact match(es)')
		expect(output).toContain('**executeKitGrep**')
		expect(output).toContain('`src/kit-wrapper.ts:147`')
	})

	test('Markdown: shows score for fuzzy matches', () => {
		const output = formatIndexFindResults(fuzzyResult, 'markdown')
		expect(output).toContain('fuzzy')
		expect(output).toContain('[score: 0.8]')
		expect(output).toContain('[score: 0.5]')
	})

	test('zero results shows message', () => {
		const empty: IndexFindResult = {
			query: 'nope',
			matchType: 'exact',
			count: 0,
			results: [],
		}
		const output = formatIndexFindResults(empty, 'markdown')
		expect(output).toContain('No symbols found matching: nope')
	})

	test('error result in both formats', () => {
		const error: IndexError = { error: 'Index not found', isError: true }
		expect(formatIndexFindResults(error, 'json')).toContain('Index not found')
		expect(formatIndexFindResults(error, 'markdown')).toContain('**Error:** Index not found')
	})
})

// ============================================================================
// formatIndexOverviewResults
// ============================================================================

describe('formatIndexOverviewResults', () => {
	const result: IndexOverviewResult = {
		file: 'src/main.ts',
		symbolCount: 3,
		symbols: [
			{ name: 'main', type: 'function', line: 1 },
			{ name: 'Config', type: 'type', line: 10 },
			{ name: 'helper', type: 'function', line: 20 },
		],
	}

	test('JSON: returns valid JSON', () => {
		const output = formatIndexOverviewResults(result, 'json')
		const parsed = JSON.parse(output)
		expect(parsed.file).toBe('src/main.ts')
		expect(parsed.symbolCount).toBe(3)
	})

	test('Markdown: groups symbols by type', () => {
		const output = formatIndexOverviewResults(result, 'markdown')
		expect(output).toContain('## src/main.ts')
		expect(output).toContain('**3 symbol(s)**')
		expect(output).toContain('### functions')
		expect(output).toContain('`main` (line 1)')
		expect(output).toContain('### types')
		expect(output).toContain('`Config` (line 10)')
	})

	test('zero symbols shows message', () => {
		const empty: IndexOverviewResult = {
			file: 'empty.ts',
			symbolCount: 0,
			symbols: [],
		}
		const output = formatIndexOverviewResults(empty, 'markdown')
		expect(output).toContain('No symbols found in: empty.ts')
	})

	test('error result', () => {
		const error: IndexError = { error: 'Load failed', isError: true }
		expect(formatIndexOverviewResults(error, 'markdown')).toContain('**Error:** Load failed')
	})
})

// ============================================================================
// formatIndexStatsResults
// ============================================================================

describe('formatIndexStatsResults', () => {
	const result: IndexStatsResult = {
		files: 10,
		totalSymbols: 50,
		distribution: { function: 30, class: 10, type: 10 },
		hotspots: [
			{ directory: 'src/lib', symbolCount: 25 },
			{ directory: 'src/utils', symbolCount: 15 },
		],
	}

	test('JSON: returns valid JSON', () => {
		const output = formatIndexStatsResults(result, 'json')
		const parsed = JSON.parse(output)
		expect(parsed.files).toBe(10)
		expect(parsed.totalSymbols).toBe(50)
		expect(parsed.distribution.function).toBe(30)
	})

	test('Markdown: shows stats and distribution', () => {
		const output = formatIndexStatsResults(result, 'markdown')
		expect(output).toContain('## Codebase Statistics')
		expect(output).toContain('**Files:** 10')
		expect(output).toContain('**Total Symbols:** 50')
		expect(output).toContain('### Symbol Distribution')
		expect(output).toContain('- function: 30')
	})

	test('Markdown: shows hotspots', () => {
		const output = formatIndexStatsResults(result, 'markdown')
		expect(output).toContain('### Complexity Hotspots')
		expect(output).toContain('`src/lib`: 25 symbols')
	})

	test('error result', () => {
		const error: IndexError = { error: 'No index', isError: true }
		expect(formatIndexStatsResults(error, 'markdown')).toContain('**Error:** No index')
	})
})

// ============================================================================
// formatIndexPrimeResults
// ============================================================================

describe('formatIndexPrimeResults', () => {
	test('success result (generated)', () => {
		const result: IndexPrimeResult = {
			success: true,
			location: '/repo',
			files: 100,
			symbols: 500,
			size: '1.2 MB',
			durationSec: 3.5,
		}
		const output = formatIndexPrimeResults(result, 'markdown')
		expect(output).toContain('## Index Generated Successfully')
		expect(output).toContain('**Files:** 100')
		expect(output).toContain('**Symbols:** 500')
		expect(output).toContain('**Size:** 1.2 MB')
		expect(output).toContain('**Duration:** 3.5s')
	})

	test('exists result (fresh index)', () => {
		const result: IndexPrimeExistsResult = {
			status: 'exists',
			location: '/repo',
			ageHours: 2.5,
			files: 100,
			symbols: 500,
			size: '1.2 MB',
			message: 'Index is less than 24 hours old.',
		}
		const output = formatIndexPrimeResults(result, 'markdown')
		expect(output).toContain('## Index Already Exists')
		expect(output).toContain('**Age:** 2.5 hours')
		expect(output).toContain('Index is less than 24 hours old.')
	})

	test('JSON: returns valid JSON for success', () => {
		const result: IndexPrimeResult = {
			success: true,
			location: '/repo',
			files: 10,
			symbols: 50,
			size: '0.1 MB',
			durationSec: 1.0,
		}
		const output = formatIndexPrimeResults(result, 'json')
		const parsed = JSON.parse(output)
		expect(parsed.success).toBe(true)
		expect(parsed.files).toBe(10)
	})

	test('error result', () => {
		const error: IndexError = {
			error: 'kit index timed out',
			isError: true,
		}
		const output = formatIndexPrimeResults(error, 'markdown')
		expect(output).toContain('**Error:** kit index timed out')
	})
})
