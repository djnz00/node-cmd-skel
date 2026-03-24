import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { buildReleaseAssets } from '../scripts/build-release-assets.mjs';

async function writePackageJson(rootDir) {
  await writeFile(
    join(rootDir, 'package.json'),
    `${JSON.stringify(
      {
        bin: {
          'node-cmd-skel': './node-cmd-skel'
        },
        description: 'Reusable skeleton for standalone Node.js command-line tools',
        license: 'MIT',
        name: 'node-cmd-skel',
        version: '0.0.1'
      },
      null,
      2
    )}\n`
  );
}

describe('buildReleaseAssets', () => {
  it('creates release archives, a manifest, and checksums', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'node-cmd-skel-release-assets-'));
    const releasesDir = join(rootDir, 'releases');
    const outputDir = join(rootDir, 'dist', 'release-assets');

    await mkdir(releasesDir, { recursive: true });
    await writePackageJson(rootDir);

    for (const target of ['linux-x64', 'macos-x64', 'macos-arm64']) {
      const binaryPath = join(releasesDir, `node-cmd-skel-${target}`);
      await writeFile(binaryPath, `#!/usr/bin/env bash\necho ${target}\n`);
      await chmod(binaryPath, 0o755);
    }

    const { manifest } = await buildReleaseAssets({
      outputDir,
      releasesDir,
      rootDir
    });

    expect(manifest.version).toBe('0.0.1');
    expect(Object.keys(manifest.artifacts)).toEqual(['linux-x64', 'macos-x64', 'macos-arm64']);

    const checksumFile = await readFile(join(outputDir, 'SHA256SUMS'), 'utf8');
    expect(checksumFile).toContain('node-cmd-skel-linux-x64.tar.gz');
    expect(checksumFile).toContain('node-cmd-skel-macos-x64.tar.gz');
    expect(checksumFile).toContain('node-cmd-skel-macos-arm64.tar.gz');

    const manifestText = await readFile(join(outputDir, 'release-manifest.json'), 'utf8');
    expect(manifestText).toContain('"binary": "node-cmd-skel"');
  });

  it('fails when no release binaries are present', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'node-cmd-skel-release-assets-empty-'));
    const releasesDir = join(rootDir, 'releases');

    await mkdir(releasesDir, { recursive: true });
    await writePackageJson(rootDir);

    await expect(
      buildReleaseAssets({
        releasesDir,
        rootDir
      })
    ).rejects.toThrow('No release binaries were found');
  });
});
