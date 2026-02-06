#!/usr/bin/env bun

/**
 * Kit Index CLI
 *
 * Command-line interface for PROJECT_INDEX.json management.
 * Centralizes all index operations with dual output formats (markdown/JSON).
 *
 * Usage:
 *   bun run src/cli.ts <command> [args] [--format md|json]
 *
 * Based on cinema-bandit CLI architecture pattern.
 */

import { parseOutputFormat } from './lib/formatters/output'
import { parseArgs } from './lib/utils/args'

function printUsage() {
	console.log(`
Kit Index CLI - PROJECT_INDEX.json Management

Usage:
  bun run src/cli.ts prime [path] [--force] [--format md|json]
  bun run src/cli.ts find <symbol> [--format md|json]
  bun run src/cli.ts overview <file> [--format md|json]
  bun run src/cli.ts search <query> [--path <dir>] [--top-k N] [--chunk-by symbols|lines] [--build-index] [--format md|json]
  bun run src/cli.ts callers <function> [--format md|json]

Commands:
  prime       Generate/refresh PROJECT_INDEX.json
              Args: [path] - Optional directory to index (defaults to git root or CWD)
              Options: --force (regenerate even if < 24h old)

  find        Find symbol definitions by name
              Args: <symbol> - Symbol name to search for

  overview    List all symbols in a file
              Args: <file> - File path (relative or absolute)

  search      Semantic search using natural language
              Args: <query> - Natural language search query
              Options:
                --path <dir> - Directory to search (default: git root)
                --top-k <N> - Number of results (default: 5)
                --chunk-by <mode> - Chunking strategy: symbols|lines (default: symbols)
                --build-index - Force rebuild vector index

  callers     Find who calls a function (call sites)
              Args: <function> - Function name to analyze

Options:
  --format <type>   Output format: "md" (default) or "json"
                    Markdown is human-readable with colors
                    JSON is machine-readable for parsing

  --force           Force regenerate (prime command only)
  --help            Show this help message

Examples:
  # Generate index at git root
  bun run src/cli.ts prime

  # Generate index for specific directory
  bun run src/cli.ts prime /path/to/project

  # Force regenerate
  bun run src/cli.ts prime --force

  # Find symbol
  bun run src/cli.ts find MyFunction

  # Get file overview
  bun run src/cli.ts overview src/index.ts

  # Find callers with JSON output
  bun run src/cli.ts callers executeFind --format json
`)
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)

	// Show help if no args or --help flag
	if (args.length === 0 || args.includes('--help')) {
		printUsage()
		process.exit(0)
	}

	const { command, positional, flags } = parseArgs(args)
	const format = parseOutputFormat(flags.format)

	try {
		switch (command) {
			case 'prime': {
				const path = positional[0] // Optional path argument
				const { executePrime } = await import('./lib/commands/prime')
				await executePrime(flags.force === 'true', format, path)
				break
			}

			case 'find': {
				const symbol = positional[0]
				if (!symbol) {
					console.error('Error: <symbol> required for find command')
					console.error('Usage: bun run src/cli.ts find <symbol>')
					process.exit(1)
				}
				const { executeFind } = await import('./lib/commands/find')
				await executeFind(symbol, format)
				break
			}

			case 'overview': {
				const file = positional[0]
				if (!file) {
					console.error('Error: <file> required for overview command')
					console.error('Usage: bun run src/cli.ts overview <file>')
					process.exit(1)
				}
				const { executeOverview } = await import('./lib/commands/overview')
				await executeOverview(file, format)
				break
			}

			case 'search': {
				const query = positional[0]
				if (!query) {
					console.error('Error: <query> required for search command')
					console.error('Usage: bun run src/cli.ts search <query> [options]')
					process.exit(1)
				}

				const { executeSearch } = await import('./lib/commands/search')

				// Parse options
				const options = {
					path: flags.path,
					topK: flags['top-k'] ? Number(flags['top-k']) : undefined,
					chunkBy: flags['chunk-by'] as 'symbols' | 'lines' | undefined,
					buildIndex: flags['build-index'] === 'true',
				}

				await executeSearch(query, options, format)
				break
			}

			case 'callers': {
				const functionName = positional[0]
				if (!functionName) {
					console.error('Error: <function> required for callers command')
					console.error('Usage: bun run src/cli.ts callers <function>')
					process.exit(1)
				}
				const { executeCallers } = await import('./lib/commands/callers')
				await executeCallers(functionName, format)
				break
			}

			default:
				console.error(`Unknown command: ${command}`)
				console.error("Run 'bun run src/cli.ts --help' for usage")
				process.exit(1)
		}
	} catch (error) {
		console.error('Error:', error instanceof Error ? error.message : error)
		process.exit(1)
	}
}

main()
