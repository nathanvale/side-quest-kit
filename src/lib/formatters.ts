/**
 * Kit Plugin Formatters
 *
 * Response formatters for MCP tool output in markdown and JSON formats.
 */

import { truncate } from '@side-quest/core/utils'
import type {
	ErrorResult,
	KitResult,
	SemanticResult,
	UsagesResult,
} from './types.js'
import { isError } from './types.js'

// ============================================================================
// Semantic Formatters
// ============================================================================

/**
 * Format semantic search results for display.
 * @param result - Semantic result or error
 * @param format - Output format (markdown or json)
 * @returns Formatted string
 */
export function formatSemanticResults(
	result: KitResult<SemanticResult>,
	format: 'markdown' | 'json' = 'markdown',
): string {
	if (isError(result)) {
		return formatError(result, format)
	}

	if (format === 'json') {
		return JSON.stringify(result, null, 2)
	}

	// Markdown format
	const lines: string[] = []

	lines.push(`## Semantic Search Results`)
	lines.push('')

	// Show fallback notice if applicable
	if (result.fallback && result.installHint) {
		lines.push(`> **Note:** ${result.installHint.split('\n')[0]}`)
		lines.push('>')
		lines.push(
			'> Using text search fallback. Results may be less relevant than semantic search.',
		)
		lines.push('')
	}

	lines.push(`Found **${result.count}** matches for query: _"${result.query}"_`)
	lines.push('')

	if (result.matches.length === 0) {
		lines.push('_No matches found._')
		return lines.join('\n')
	}

	result.matches.forEach((match, i) => {
		const score = (match.score * 100).toFixed(1)
		const lineInfo =
			match.startLine && match.endLine
				? `:${match.startLine}-${match.endLine}`
				: match.startLine
					? `:${match.startLine}`
					: ''

		lines.push(`### ${i + 1}. ${match.file}${lineInfo} (${score}% relevance)`)
		lines.push('')
		lines.push('```')
		lines.push(truncate(match.chunk, 500))
		lines.push('```')
		lines.push('')
	})

	return lines.join('\n')
}

// ============================================================================
// Error Formatters
// ============================================================================

/**
 * Format an error result.
 * @param error - Error result
 * @param format - Output format
 * @returns Formatted string
 */
export function formatError(
	error: ErrorResult,
	format: 'markdown' | 'json' = 'markdown',
): string {
	if (format === 'json') {
		return JSON.stringify(error, null, 2)
	}

	const lines: string[] = []
	lines.push(`## Error`)
	lines.push('')
	lines.push(`**${error.error}**`)

	if (error.hint) {
		lines.push('')
		lines.push(`**Hint:** ${error.hint}`)
	}

	return lines.join('\n')
}

// ============================================================================
// Usages Formatters
// ============================================================================

/**
 * Format symbol usages results for display.
 * @param result - Usages result or error
 * @param format - Output format (markdown or json)
 * @returns Formatted string
 */
export function formatUsagesResults(
	result: KitResult<UsagesResult>,
	format: 'markdown' | 'json' = 'markdown',
): string {
	if (isError(result)) {
		return formatError(result, format)
	}

	if (format === 'json') {
		return JSON.stringify(result, null, 2)
	}

	// Markdown format
	const lines: string[] = []

	lines.push(`## Symbol Definitions`)
	lines.push('')
	lines.push(
		`Found **${result.count}** definition(s) for \`${result.symbolName}\``,
	)
	lines.push('')

	if (result.usages.length === 0) {
		lines.push('_No definitions found._')
		return lines.join('\n')
	}

	for (const usage of result.usages) {
		const icon = getSymbolTypeIcon(usage.type)
		const lineInfo = usage.line ? `:${usage.line}` : ''

		lines.push(`### ${icon} ${usage.name}`)
		lines.push('')
		lines.push(`- **Type:** ${usage.type}`)
		lines.push(`- **File:** \`${usage.file}${lineInfo}\``)

		if (usage.context) {
			lines.push('')
			lines.push('```')
			lines.push(usage.context)
			lines.push('```')
		}

		lines.push('')
	}

	return lines.join('\n')
}

/**
 * Get an icon for a symbol type (usages variant).
 */
function getSymbolTypeIcon(type: string): string {
	const icons: Record<string, string> = {
		function: '📦',
		class: '📚',
		method: '🔧',
		property: '🏷️',
		variable: '📌',
		constant: '🔒',
		type: '📝',
		interface: '📋',
		enum: '📊',
		module: '📁',
	}
	return icons[type.toLowerCase()] ?? '•'
}
