import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  readProjectMeta,
  releaseArchiveName,
  releaseBinaryName,
  supportedDistTargets
} from './project-meta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, '..');

export async function buildReleaseAssets({
  outputDir = path.join(defaultRootDir, 'dist', 'release-assets'),
  releaseTag,
  releasesDir = path.join(defaultRootDir, 'releases'),
  rootDir = defaultRootDir
} = {}) {
  const project = await readProjectMeta({ rootDir });
  const tag = releaseTag ?? process.env.RELEASE_TAG ?? `v${project.version}`;

  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });

  const artifacts = {};

  for (const target of supportedDistTargets) {
    const sourceBinaryPath = path.join(releasesDir, releaseBinaryName(project.cliName, target));
    if (!(await exists(sourceBinaryPath)))
      continue;

    const archiveName = releaseArchiveName(project.cliName, target);
    const archivePath = path.join(outputDir, archiveName);
    await createArchive({
      archivePath,
      binaryName: project.cliName,
      sourceBinaryPath
    });

    artifacts[target] = {
      archive: archiveName,
      sha256: await hashFile(archivePath)
    };
  }

  if (Object.keys(artifacts).length === 0) {
    throw new Error('No release binaries were found in releases/. Run make dist first.');
  }

  const manifest = {
    artifacts,
    binary: project.cliName,
    generatedAt: new Date().toISOString(),
    name: project.packageName,
    tag,
    version: project.version
  };

  await writeFile(path.join(outputDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(outputDir, 'SHA256SUMS'),
    Object.values(artifacts)
      .map(({ archive, sha256 }) => `${sha256}  ${archive}`)
      .join('\n') + '\n'
  );

  return {
    manifest,
    outputDir
  };
}

async function createArchive({ archivePath, binaryName, sourceBinaryPath }) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'node-cmd-skel-release-'));

  try {
    await cp(sourceBinaryPath, path.join(workDir, binaryName));
    await run('tar', ['-C', workDir, '-czf', archivePath, binaryName]);
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code}`
        )
      );
    });
  });
}

async function main() {
  const { outputDir, manifest } = await buildReleaseAssets();
  console.log(
    `[release-assets] Wrote ${Object.keys(manifest.artifacts).length} archive(s) to ${outputDir}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[release-assets] ${error.message}`);
    process.exitCode = 1;
  });
}
