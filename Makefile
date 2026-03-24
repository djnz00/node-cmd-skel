SHELL := /usr/bin/env bash
PNPM ?= pnpm
DIST_TARGETS ?= linux-x64 macos-x64

.DEFAULT_GOAL := help
.PHONY: help install test clean clean-cache dist

help:
	@printf '%s\n' \
		'Targets:' \
		'  make install      Install dependencies with pnpm --frozen-lockfile' \
		'  make test         Run the Vitest suite' \
		'  make clean        Remove generated dist and release outputs' \
		'  make clean-cache  Remove cached Node runtime downloads for dist builds' \
		'  make dist         Build standalone executables for DIST_TARGETS'

install:
	CI=true $(PNPM) install --frozen-lockfile

test:
	$(PNPM) test

clean:
	rm -rf dist
	find releases -mindepth 1 ! -name '.gitignore' -exec rm -rf {} +

clean-cache:
	@cache_dir="$${DIST_CACHE_DIR:-$${XDG_CACHE_HOME:-$$HOME/.cache}/node-cmd-skel/dist}"; \
	rm -rf "$$cache_dir"; \
	printf 'Removed %s\n' "$$cache_dir"

dist: install
	DIST_TARGETS='$(DIST_TARGETS)' node scripts/build-dist.mjs
