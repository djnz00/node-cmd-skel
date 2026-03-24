import { describe, expect, it } from 'vitest';

import { renderHomebrewFormula } from '../scripts/render-homebrew-formula.mjs';

const manifest = {
  artifacts: {
    'linux-x64': {
      archive: 'node-cmd-skel-linux-x64.tar.gz',
      sha256: 'a'.repeat(64)
    },
    'macos-arm64': {
      archive: 'node-cmd-skel-macos-arm64.tar.gz',
      sha256: 'b'.repeat(64)
    },
    'macos-x64': {
      archive: 'node-cmd-skel-macos-x64.tar.gz',
      sha256: 'c'.repeat(64)
    }
  },
  tag: 'v0.0.1',
  version: '0.0.1'
};

describe('renderHomebrewFormula', () => {
  it('renders a formula for all release targets', () => {
    const formula = renderHomebrewFormula({
      cliName: 'node-cmd-skel',
      description: 'Reusable skeleton for standalone Node.js command-line tools',
      license: 'MIT',
      manifest,
      packageName: 'node-cmd-skel',
      repository: 'djnz00/node-cmd-skel'
    });

    expect(formula).toContain('class NodeCmdSkel < Formula');
    expect(formula).toContain('node-cmd-skel-linux-x64.tar.gz');
    expect(formula).toContain('node-cmd-skel-macos-x64.tar.gz');
    expect(formula).toContain('node-cmd-skel-macos-arm64.tar.gz');
    expect(formula).toContain('bin.install "node-cmd-skel"');
    expect(formula).toContain('shell_output("#{bin}/node-cmd-skel --help")');
  });

  it('requires all three release targets', () => {
    const incompleteManifest = {
      ...manifest,
      artifacts: {
        ...manifest.artifacts
      }
    };

    delete incompleteManifest.artifacts['macos-arm64'];

    expect(() =>
      renderHomebrewFormula({
        cliName: 'node-cmd-skel',
        description: 'Reusable skeleton for standalone Node.js command-line tools',
        manifest: incompleteManifest,
        packageName: 'node-cmd-skel',
        repository: 'djnz00/node-cmd-skel'
      })
    ).toThrow('Missing release artifact for macos-arm64.');
  });
});
