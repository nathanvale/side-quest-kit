import { resolve } from 'node:path'
import {
	ensureCommandAvailable,
	spawnSyncCollect,
	spawnWithTimeout,
} from '@side-quest/core/spawn'
import { validatePathOrDefault } from '@side-quest/core/validation'

/**
 * Find the git repository root directory (async).
 * @returns The git root path, or null if not in a git repo
 */
export async function findGitRoot(): Promise<string | null> {
	const gitCmd = ensureCommandAvailable('git')
	const result = await spawnWithTimeout(
		[gitCmd, 'rev-parse', '--show-toplevel'],
		10_000,
	)

	if (result.timedOut || result.exitCode !== 0) {
		return null
	}

	if (result.stdout) {
		return result.stdout.trim()
	}

	return null
}

/**
 * Find the git repository root directory (synchronous).
 * @returns The git root path, or undefined if not in a git repo
 */
export function findGitRootSync(): string | undefined {
	const result = spawnSyncCollect(['git', 'rev-parse', '--show-toplevel'])
	if (result.exitCode === 0 && result.stdout.trim()) {
		return result.stdout.trim()
	}
	return undefined
}

/**
 * Resolve the target directory for operations.
 * Uses custom path if provided, falls back to git root, then cwd.
 * @param customPath - Optional custom path to use
 * @returns Resolved target directory path
 */
export async function getTargetDir(customPath?: string): Promise<string> {
	if (customPath) {
		return resolve(customPath)
	}

	const gitRoot = await findGitRoot()
	if (gitRoot) {
		return gitRoot
	}

	return process.cwd()
}

type ResolveRepoPathDeps = {
	validatePath?: (path: string) => Promise<string> | string
	findGitRoot?: () => string | undefined
	cwd?: () => string
}

/**
 * Resolve repository path for tools that accept repo-root-relative file paths.
 * Preserves legacy behavior: explicit path is validated, otherwise git root then cwd.
 *
 * @param customPath - Optional repository path override from tool input
 * @param deps - Optional dependency injection for deterministic unit tests
 * @returns The resolved absolute/validated repository path
 */
export async function resolveRepoPath(
	customPath?: string,
	deps: ResolveRepoPathDeps = {},
): Promise<string> {
	const validatePath = deps.validatePath ?? validatePathOrDefault
	const findRoot = deps.findGitRoot ?? findGitRootSync
	const getCwd = deps.cwd ?? (() => process.cwd())

	if (customPath) {
		return await Promise.resolve(validatePath(customPath))
	}

	return findRoot() || getCwd()
}

/**
 * Constants for index file management
 */
export const INDEX_FILE = 'PROJECT_INDEX.json'
export const MAX_AGE_HOURS = 24
