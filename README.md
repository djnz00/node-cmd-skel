[![CI](https://github.com/djnz00/node-cmd-skel/actions/workflows/ci.yml/badge.svg)](https://github.com/djnz00/node-cmd-skel/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/djnz00/node-cmd-skel?display_name=tag)](https://github.com/djnz00/node-cmd-skel/releases/latest)
[![Homebrew](https://img.shields.io/badge/Homebrew-djnz00%2Fdjnz00-fbb040?logo=homebrew)](https://github.com/djnz00/homebrew-djnz00)
[![Node >=24](https://img.shields.io/badge/node-%3E%3D24-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/djnz00/node-cmd-skel)](./LICENSE)

# node-cmd-skel

`node-cmd-skel` is a reusable skeleton for standalone Node.js command-line tools. The shipped CLI is intentionally minimal: it only exposes root help, version output, and a no-op `skel` subcommand so the repository can stay focused on structure, packaging, release automation, and rename-friendly defaults.

## Install

Homebrew:

```bash
brew install djnz00/djnz00/node-cmd-skel
```

npm tarball:

```bash
npm install -g ./node-cmd-skel-<version>.tgz
```

Standalone binaries:

1. Download the matching `node-cmd-skel-<target>.tar.gz` asset from the latest GitHub release.
2. Extract it.
3. Place `node-cmd-skel` somewhere on your `PATH`.

Source checkout:

```bash
pnpm install --frozen-lockfile
./node-cmd-skel --help
```

Runtime requirement: Node.js `>=24`.
Standalone build requirement: Node.js `25.5+`.

## Usage

```bash
node-cmd-skel --help
node-cmd-skel --version
node-cmd-skel skel
node-cmd-skel skel --help
```

`skel` is the placeholder subcommand. It does not read, write, or mutate external state.

## Development

```bash
make install
make test
make dist
pnpm run release:verify
```

`make dist` defaults to `linux-x64` and `macos-x64`. Set `DIST_TARGETS` to include `macos-arm64` when needed.

## Release Outputs

The release pipeline can publish:

- standalone `.tar.gz` archives for `linux-x64`, `macos-x64`, and `macos-arm64`
- `SHA256SUMS`
- `release-manifest.json`
- an npm package tarball
- a generated Homebrew formula

Maintainer-facing distribution notes live in [`docs/distribution.md`](./docs/distribution.md).

<!-- NEWCMD:START -->
## Rebrand a Clone

After cloning this skeleton into a new repository, rename it by setting the repository directory name first and then running:

```bash
./scripts/newcmd
```

The script derives the new command name from the repository basename, rewrites package/runtime/docs/workflow naming, prompts for the Homebrew tap in `owner/tap` form, and can remove itself plus its dedicated tests once the clone has been rebranded successfully.
<!-- NEWCMD:END -->
