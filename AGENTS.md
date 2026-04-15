# Repository Guidelines

## Project Structure & Module Organization

`node-cmd-skel` is a small Node.js CLI skeleton. The executable entrypoint is [`node-cmd-skel`](./node-cmd-skel), core runtime code lives in `lib/`, and subcommands are grouped under `lib/commands/` (for example `lib/commands/skel.js`). Build and release automation lives in `scripts/`, tests live in `tests/`, and maintainer-facing release notes live in `docs/`. Generated artifacts belong in `dist/` and `releases/` and should not be committed unless a release workflow explicitly requires them.

## Build, Test, and Development Commands

Use `pnpm` with the checked-in lockfile.

- `make install` installs dependencies with `pnpm install --frozen-lockfile`.
- `make test` or `pnpm test` runs the Vitest suite once.
- `pnpm run test:watch` starts Vitest in watch mode for local iteration.
- `make dist` builds standalone executables for the targets in `DIST_TARGETS`.
- `pnpm run release:verify` performs the full local release-candidate flow.
- `make clean` removes generated `dist/` and `releases/` outputs.

For a quick smoke test, run `./node-cmd-skel --help`.

## Coding Style & Naming Conventions

Follow the existing ESM style: `import`/`export`, semicolons, single quotes, and 2-space indentation. Prefer small, focused modules with named exports. Use `camelCase` for variables and functions, `PascalCase` only for classes/types, and keep filenames lowercase; use kebab-case for multiword scripts such as `build-release-assets.mjs`. Keep CLI text explicit and testable.

No dedicated formatter or linter is configured in this repository, so match the surrounding style closely when editing.

## Testing Guidelines

Tests use Vitest and live in `tests/*.test.js`. Add or update tests for any behavior change, especially CLI help/output, versioning, and release asset generation. Name test files after the unit under test, such as `cli.test.js` or `render-homebrew-formula.test.js`.

## Commit & Pull Request Guidelines

This branch does not have commit history yet, so no repository-specific commit convention is established. Use short, imperative commit messages with one logical change per commit, for example `Add skel help regression test`.

Pull requests should explain the user-visible change, list the verification commands you ran, and link the related issue when applicable. Include terminal output snippets only when CLI behavior or release artifacts changed.

## Release & Configuration Notes

Runtime support is Node.js `>=24`; standalone binary builds require Node.js `25.5+`. Use `DIST_TARGETS` to override build targets, and see `docs/distribution.md` before changing release packaging or Homebrew formula generation.
