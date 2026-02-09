import { defineConfig } from 'bunup'

export default defineConfig({
	entry: ['./src/index.ts', './mcp/index.ts'],
	outDir: './dist',
	format: 'esm',
	banner: '#!/usr/bin/env bun',
	dts: false,
	clean: true,
	splitting: false,
	target: 'bun',
	external: ['@side-quest/core', 'web-tree-sitter', 'tree-sitter-wasms'],
})
