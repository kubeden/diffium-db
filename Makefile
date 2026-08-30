.PHONY: install check test fmt run shot

install:
	bun install

check:
	bunx tsc --noEmit

test:
	bun test

fmt:
	bunx prettier --write "src/**/*.ts" "scripts/**/*.ts"

run:
	bun run src/index.ts watch

shot:
	bun run scripts/shot.ts --schema demo
