# Distribution

This repository is a skeleton template, so the distribution pipeline is intentionally generic. It produces the same release shape that derived CLIs can keep after rebranding.

## Release Candidate Outputs

`pnpm run release:verify` performs the local release-candidate flow:

1. `make clean`
2. `make dist`
3. smoke-test the Linux raw executable with `--help`
4. build `.tar.gz` release archives plus `SHA256SUMS` and `release-manifest.json`
5. create an npm package tarball with `npm pack`
6. render a Homebrew formula into `dist/homebrew/`

The default standalone targets are:

- `linux-x64`
- `macos-x64`
- `macos-arm64`

Runtime requirement: Node.js `>=24`.
Standalone build requirement: Node.js `25.5+`.

## GitHub Actions

`ci.yml` runs two validation paths:

- `test` on Node `24.14.0` to enforce the runtime contract
- `release-readiness` on Node `25.8.1` to enforce the standalone-build contract

`release.yml` runs on pushes to `main` and:

1. resolves the package version
2. skips work if that version is already released
3. reruns tests
4. builds standalone executables on matching runners
5. assembles release archives and metadata
6. uploads GitHub release assets
7. optionally publishes to npm
8. optionally updates the Homebrew tap

## Secrets and Variables

Optional publishing steps depend on:

- `NPM_TOKEN`
- `HOMEBREW_TAP_GITHUB_TOKEN`
- `HOMEBREW_TAP_REPO`

Useful local or workflow overrides:

- `DIST_TARGETS`
- `DIST_CACHE_DIR`
- `RELEASE_REPO`
- `RELEASE_TAG`

Missing optional publish credentials cause a warning and a skipped publish step rather than a failed release build.

## Homebrew

The formula is generated from `dist/release-assets/release-manifest.json`, so the release URLs, checksums, and version stay tied to the assets that were actually built.

The base skeleton assumes:

- shortened install syntax: `brew install djnz00/djnz00/node-cmd-skel`
- tap repository: `djnz00/homebrew-djnz00`

Derived repositories should update those values through `./scripts/newcmd`.

<!-- NEWCMD:START -->
## Clone-Time Rebranding

`./scripts/newcmd` is only for the base skeleton and freshly cloned derivative repositories. It rewrites command/package/release naming from the repository basename and prompts for the shortened Homebrew tap name in `owner/tap` form. Unless `NEWCMD_TEST_HARNESS=1` is set, it can remove itself and its dedicated tests after a successful rename.
<!-- NEWCMD:END -->
