import { describe, expect, test } from 'bun:test'
import { resolveRepoPath } from '../src/lib/utils/git.js'

describe('resolveRepoPath', () => {
	test('uses validatePath when customPath is provided', async () => {
		const result = await resolveRepoPath('./custom/path', {
			validatePath: async (path) => `/validated/${path}`,
			findGitRoot: () => '/repo-root',
			cwd: () => '/cwd',
		})

		expect(result).toBe('/validated/./custom/path')
	})

	test('uses git root when customPath is omitted', async () => {
		const result = await resolveRepoPath(undefined, {
			validatePath: async () => '/validated/path',
			findGitRoot: () => '/repo-root',
			cwd: () => '/cwd',
		})

		expect(result).toBe('/repo-root')
	})

	test('falls back to cwd when customPath is omitted and git root is unavailable', async () => {
		const result = await resolveRepoPath(undefined, {
			validatePath: async () => '/validated/path',
			findGitRoot: () => undefined,
			cwd: () => '/cwd',
		})

		expect(result).toBe('/cwd')
	})

	test('treats empty string as omitted path', async () => {
		const result = await resolveRepoPath('', {
			validatePath: async () => '/validated/path',
			findGitRoot: () => '/repo-root',
			cwd: () => '/cwd',
		})

		expect(result).toBe('/repo-root')
	})
})
