import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
	findSymbol,
	findSymbolFuzzy,
	getComplexityHotspots,
	getFileSymbols,
	getSymbolTypeDistribution,
	type ProjectIndex,
} from '../src/lib/utils/index-parser'

// ============================================================================
// Mock loadProjectIndex - intercept file I/O, test query + format logic
// ============================================================================

const fixtureIndex: ProjectIndex = {
	file_tree: [],
	files: [],
	symbols: {
		'src/main.ts': [
			{
				name: 'main',
				type: 'function',
				start_line: 1,
				end_line: 10,
				code: 'export function main() {}',
				file: 'src/main.ts',
			},
			{
				name: 'Config',
				type: 'type',
				start_line: 12,
				end_line: 15,
				code: 'export type Config = { port: number }',
				file: 'src/main.ts',
			},
		],
		'src/utils.ts': [
			{
				name: 'helper',
				type: 'function',
				start_line: 1,
				end_line: 5,
				code: 'export function helper() {}',
				file: 'src/utils.ts',
			},
			{
				name: 'MAX_RETRIES',
				type: 'constant',
				start_line: 7,
				end_line: 7,
				code: 'export const MAX_RETRIES = 3',
				file: 'src/utils.ts',
			},
		],
	},
}

const mockLoadProjectIndex = mock(() => Promise.resolve(fixtureIndex))

mock.module('../src/lib/utils/index-parser', () => ({
	loadProjectIndex: mockLoadProjectIndex,
	findSymbol,
	findSymbolFuzzy,
	getFileSymbols,
	getSymbolTypeDistribution,
	getComplexityHotspots,
}))

const { executeIndexFind, executeIndexOverview, executeIndexStats } = await import(
	'../src/lib/index-tools.js'
)

afterEach(() => {
	mockLoadProjectIndex.mockClear()
	mockLoadProjectIndex.mockImplementation(() => Promise.resolve(fixtureIndex))
})

// ============================================================================
// executeIndexFind
// ============================================================================

describe('executeIndexFind', () => {
	test('exact match: returns matchType "exact" with correct fields', async () => {
		const result = await executeIndexFind('main')
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		expect(result.matchType).toBe('exact')
		expect(result.count).toBe(1)
		expect(result.query).toBe('main')
		expect(result.results[0].name).toBe('main')
		expect(result.results[0].type).toBe('function')
		expect(result.results[0].file).toBe('src/main.ts')
		expect(result.results[0].line).toBe(1)
	})

	test('fuzzy fallback: returns matchType "fuzzy" with scores', async () => {
		const result = await executeIndexFind('hel')
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		expect(result.matchType).toBe('fuzzy')
		expect(result.count).toBeGreaterThan(0)
		expect(result.results[0].score).toBeDefined()
		expect(result.results[0].name).toBe('helper')
	})

	test('returns IndexError when loadProjectIndex throws', async () => {
		mockLoadProjectIndex.mockImplementation(() => Promise.reject(new Error('File not found')))

		const result = await executeIndexFind('main')
		expect('isError' in result).toBe(true)
		if (!('isError' in result)) return
		expect(result.error).toContain('File not found')
	})

	test('empty results for non-existent symbol', async () => {
		const result = await executeIndexFind('nonExistentSymbol123')
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		expect(result.count).toBe(0)
		expect(result.matchType).toBe('fuzzy')
	})

	test('passes indexPath to loadProjectIndex', async () => {
		await executeIndexFind('main', '/custom/path')
		expect(mockLoadProjectIndex).toHaveBeenCalledWith('/custom/path')
	})
})

// ============================================================================
// executeIndexOverview
// ============================================================================

describe('executeIndexOverview', () => {
	test('returns symbols for known file', async () => {
		const result = await executeIndexOverview('src/main.ts')
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		expect(result.file).toBe('src/main.ts')
		expect(result.symbolCount).toBe(2)
		expect(result.symbols).toHaveLength(2)
		expect(result.symbols[0].name).toBe('main')
		expect(result.symbols[0].type).toBe('function')
		expect(result.symbols[0].line).toBe(1)
	})

	test('returns empty symbols for unknown file', async () => {
		const result = await executeIndexOverview('src/nonexistent.ts')
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		expect(result.symbolCount).toBe(0)
		expect(result.symbols).toHaveLength(0)
	})

	test('returns IndexError on load failure', async () => {
		mockLoadProjectIndex.mockImplementation(() => Promise.reject(new Error('Disk error')))

		const result = await executeIndexOverview('src/main.ts')
		expect('isError' in result).toBe(true)
		if (!('isError' in result)) return
		expect(result.error).toContain('Disk error')
	})

	test('passes indexPath to loadProjectIndex', async () => {
		await executeIndexOverview('src/main.ts', '/custom/index')
		expect(mockLoadProjectIndex).toHaveBeenCalledWith('/custom/index')
	})
})

// ============================================================================
// executeIndexStats
// ============================================================================

describe('executeIndexStats', () => {
	test('returns files, totalSymbols, distribution, hotspots', async () => {
		const result = await executeIndexStats()
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		expect(result.files).toBe(2)
		expect(result.totalSymbols).toBe(4)
		expect(result.distribution.function).toBe(2)
		expect(result.distribution.type).toBe(1)
		expect(result.distribution.constant).toBe(1)
		expect(result.hotspots.length).toBeGreaterThan(0)
	})

	test('hotspots contain the right directories', async () => {
		const result = await executeIndexStats()
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		const dirs = result.hotspots.map((h) => h.directory)
		expect(dirs).toContain('src')
	})

	test('returns IndexError on load failure', async () => {
		mockLoadProjectIndex.mockImplementation(() => Promise.reject(new Error('Permission denied')))

		const result = await executeIndexStats()
		expect('isError' in result).toBe(true)
		if (!('isError' in result)) return
		expect(result.error).toContain('Permission denied')
	})

	test('respects topN parameter', async () => {
		const result = await executeIndexStats(undefined, 1)
		expect('isError' in result).toBe(false)
		if ('isError' in result) return

		expect(result.hotspots.length).toBe(1)
	})
})
