import { afterEach, describe, expect, mock, test } from 'bun:test'
import { KitErrorType } from '../src/lib/errors.js'

// ============================================================================
// Mocks
// ============================================================================

const mockEnsureCommandAvailable = mock(() => 'kit')
const mockSpawnSyncCollect = mock(() => ({
	stdout: '',
	stderr: '',
	exitCode: 0,
}))
const mockBuildEnhancedPath = mock(() => '/usr/local/bin:/usr/bin')
const mockWithTempJsonFileSync = mock(() => [])
const mockEnsureCacheDir = mock((base: string) => `${base}/.kit/vector_db`)
const mockIsCachePopulated = mock(() => false)

mock.module('@side-quest/core/spawn', () => ({
	ensureCommandAvailable: mockEnsureCommandAvailable,
	spawnSyncCollect: mockSpawnSyncCollect,
	buildEnhancedPath: mockBuildEnhancedPath,
}))

mock.module('@side-quest/core/fs', () => ({
	ensureCacheDir: mockEnsureCacheDir,
	isCachePopulated: mockIsCachePopulated,
	withTempJsonFileSync: mockWithTempJsonFileSync,
}))

const {
	isKitInstalled,
	getKitVersion,
	executeKitGrep,
	executeKitSemantic,
	executeKitUsages,
	getSemanticCacheDir,
} = await import('../src/lib/kit-wrapper.js')

afterEach(() => {
	mockEnsureCommandAvailable.mockClear()
	mockSpawnSyncCollect.mockClear()
	mockBuildEnhancedPath.mockClear()
	mockWithTempJsonFileSync.mockClear()
	mockEnsureCacheDir.mockClear()
	mockIsCachePopulated.mockClear()

	// Reset defaults
	mockEnsureCommandAvailable.mockImplementation(() => 'kit')
	mockSpawnSyncCollect.mockImplementation(() => ({
		stdout: '',
		stderr: '',
		exitCode: 0,
	}))
	mockWithTempJsonFileSync.mockImplementation(() => [])
	mockIsCachePopulated.mockImplementation(() => false)
})

// ============================================================================
// isKitInstalled
// ============================================================================

describe('isKitInstalled', () => {
	test('returns true when command is available', () => {
		mockEnsureCommandAvailable.mockImplementation(() => 'kit')
		expect(isKitInstalled()).toBe(true)
	})

	test('returns false when command throws', () => {
		mockEnsureCommandAvailable.mockImplementation(() => {
			throw new Error('Command not found: kit')
		})
		expect(isKitInstalled()).toBe(false)
	})
})

// ============================================================================
// getKitVersion
// ============================================================================

describe('getKitVersion', () => {
	test('returns trimmed version string on success', () => {
		mockSpawnSyncCollect.mockImplementation(() => ({
			stdout: '  3.2.1\n',
			stderr: '',
			exitCode: 0,
		}))
		expect(getKitVersion()).toBe('3.2.1')
	})

	test('returns null on failure', () => {
		mockSpawnSyncCollect.mockImplementation(() => ({
			stdout: '',
			stderr: 'command not found',
			exitCode: 1,
		}))
		expect(getKitVersion()).toBeNull()
	})

	test('returns null when spawnSyncCollect throws', () => {
		mockSpawnSyncCollect.mockImplementation(() => {
			throw new Error('spawn failed')
		})
		expect(getKitVersion()).toBeNull()
	})
})

// ============================================================================
// executeKitGrep
// ============================================================================

describe('executeKitGrep', () => {
	test('transforms raw matches to GrepMatch format', () => {
		mockWithTempJsonFileSync.mockImplementation(() => [
			{ file: 'src/main.ts', line_number: 10, line_content: 'const foo = 1' },
			{
				file: 'src/utils.ts',
				line_number: 5,
				line_content: 'function foo() {}',
			},
		])

		const result = executeKitGrep({ pattern: 'foo' })
		expect('error' in result).toBe(false)
		if ('error' in result) return

		expect(result.count).toBe(2)
		expect(result.matches[0].file).toBe('src/main.ts')
		expect(result.matches[0].line).toBe(10)
		expect(result.matches[0].content).toBe('const foo = 1')
		expect(result.pattern).toBe('foo')
	})

	test('returns KitNotInstalled error when kit missing', () => {
		mockEnsureCommandAvailable.mockImplementation(() => {
			throw new Error('not found')
		})

		const result = executeKitGrep({ pattern: 'test' })
		expect('error' in result).toBe(true)
		if (!('error' in result)) return
		expect(result.type).toBe(KitErrorType.KitNotInstalled)
	})

	test('passes --ignore-case when caseSensitive false', () => {
		mockWithTempJsonFileSync.mockImplementation((_prefix: string, fn: (f: string) => unknown) => {
			fn('/tmp/test.json')
			return []
		})

		executeKitGrep({ pattern: 'test', caseSensitive: false })

		// The withTempJsonFileSync callback receives the temp file, and
		// inside it calls executeKit with the args. We can verify the
		// spawnSyncCollect was called with --ignore-case in the args.
		const call = mockSpawnSyncCollect.mock.calls[0]
		if (call) {
			const args = call[0] as string[]
			expect(args).toContain('--ignore-case')
		}
	})

	test('passes --include, --exclude, --directory flags', () => {
		mockWithTempJsonFileSync.mockImplementation((_prefix: string, fn: (f: string) => unknown) => {
			fn('/tmp/test.json')
			return []
		})

		executeKitGrep({
			pattern: 'test',
			include: '*.ts',
			exclude: '*.test.ts',
			directory: 'src',
		})

		const call = mockSpawnSyncCollect.mock.calls[0]
		if (call) {
			const args = call[0] as string[]
			expect(args).toContain('--include')
			expect(args).toContain('*.ts')
			expect(args).toContain('--exclude')
			expect(args).toContain('*.test.ts')
			expect(args).toContain('--directory')
			expect(args).toContain('src')
		}
	})
})

// ============================================================================
// executeKitSemantic
// ============================================================================

describe('executeKitSemantic', () => {
	test('returns SemanticIndexNotBuilt when index not built and not forcing', () => {
		mockIsCachePopulated.mockImplementation(() => false)

		const result = executeKitSemantic({
			query: 'authentication flow',
			path: '/repo',
		})

		expect('error' in result).toBe(true)
		if (!('error' in result)) return
		expect(result.type).toBe(KitErrorType.SemanticIndexNotBuilt)
	})

	test('transforms raw matches to SemanticMatch format', () => {
		mockIsCachePopulated.mockImplementation(() => true)
		mockSpawnSyncCollect.mockImplementation(() => ({
			stdout: JSON.stringify([
				{
					file: 'src/auth.ts',
					code: 'function login() {}',
					score: 0.95,
					start_line: 10,
					end_line: 20,
				},
			]),
			stderr: '',
			exitCode: 0,
		}))

		const result = executeKitSemantic({
			query: 'authentication',
			path: '/repo',
		})
		expect('error' in result).toBe(false)
		if ('error' in result) return

		expect(result.count).toBe(1)
		expect(result.matches[0].file).toBe('src/auth.ts')
		expect(result.matches[0].chunk).toBe('function login() {}')
		expect(result.matches[0].score).toBe(0.95)
		expect(result.matches[0].startLine).toBe(10)
		expect(result.matches[0].endLine).toBe(20)
		expect(result.query).toBe('authentication')
	})

	test('returns KitNotInstalled error when kit missing', () => {
		mockEnsureCommandAvailable.mockImplementation(() => {
			throw new Error('not found')
		})

		const result = executeKitSemantic({ query: 'test', path: '/repo' })
		expect('error' in result).toBe(true)
		if (!('error' in result)) return
		expect(result.type).toBe(KitErrorType.KitNotInstalled)
	})
})

// ============================================================================
// executeKitUsages
// ============================================================================

describe('executeKitUsages', () => {
	test('transforms raw usages to SymbolUsage format', () => {
		mockWithTempJsonFileSync.mockImplementation(() => [
			{
				file: 'src/main.ts',
				type: 'function',
				name: 'doStuff',
				line: 42,
				context: 'export function doStuff() {}',
			},
		])

		const result = executeKitUsages({
			symbolName: 'doStuff',
			path: '/repo',
		})
		expect('error' in result).toBe(false)
		if ('error' in result) return

		expect(result.count).toBe(1)
		expect(result.usages[0].file).toBe('src/main.ts')
		expect(result.usages[0].type).toBe('function')
		expect(result.usages[0].name).toBe('doStuff')
		expect(result.usages[0].line).toBe(42)
		expect(result.usages[0].context).toBe('export function doStuff() {}')
		expect(result.symbolName).toBe('doStuff')
	})

	test('returns InvalidInput error for empty symbol name', () => {
		const result = executeKitUsages({ symbolName: '  ', path: '/repo' })
		expect('error' in result).toBe(true)
		if (!('error' in result)) return
		expect(result.type).toBe(KitErrorType.InvalidInput)
	})

	test('returns KitNotInstalled error when kit missing', () => {
		mockEnsureCommandAvailable.mockImplementation(() => {
			throw new Error('not found')
		})

		const result = executeKitUsages({
			symbolName: 'doStuff',
			path: '/repo',
		})
		expect('error' in result).toBe(true)
		if (!('error' in result)) return
		expect(result.type).toBe(KitErrorType.KitNotInstalled)
	})

	test('passes --type flag when symbolType specified', () => {
		mockWithTempJsonFileSync.mockImplementation((_prefix: string, fn: (f: string) => unknown) => {
			fn('/tmp/test.json')
			return []
		})

		executeKitUsages({
			symbolName: 'Config',
			symbolType: 'class',
			path: '/repo',
		})

		const call = mockSpawnSyncCollect.mock.calls[0]
		if (call) {
			const args = call[0] as string[]
			expect(args).toContain('--type')
			expect(args).toContain('class')
		}
	})
})

// ============================================================================
// getSemanticCacheDir
// ============================================================================

describe('getSemanticCacheDir', () => {
	test('returns <repo>/.kit/vector_db/ path', () => {
		mockEnsureCacheDir.mockImplementation((base: string) => `${base}/.kit/vector_db`)
		const result = getSemanticCacheDir('/my/repo')
		expect(result).toBe('/my/repo/.kit/vector_db')
	})

	test('calls ensureCacheDir with repo path and vector_db', () => {
		getSemanticCacheDir('/my/repo')
		expect(mockEnsureCacheDir).toHaveBeenCalledWith('/my/repo', 'vector_db')
	})
})
