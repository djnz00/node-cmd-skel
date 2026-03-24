import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  readProjectMeta,
  releaseArchiveName,
  releaseBinaryName,
  supportedDistTargets
} from './project-meta.mjs';
import { renderHomebrewFormula } from './render-homebrew-formula.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export async function buildReleaseCandidate({
  releaseRepo,
  releaseTag,
  root = rootDir
} = {}) {
  const project = await readProjectMeta({ rootDir: root });
  const distRoot = path.join(root, 'dist');
  const npmOutputDir = path.join(distRoot, 'npm');
  const npmCacheDir = path.join(distRoot, '.npm-cache');
  const homebrewOutputDir = path.join(distRoot, 'homebrew');
  const formulaPath = path.join(homebrewOutputDir, project.formulaFileName);
  const releaseManifestPath = path.join(distRoot, 'release-assets', 'release-manifest.json');
  const repository = releaseRepo ?? process.env.RELEASE_REPO ?? project.releaseRepository;
  const tag = releaseTag ?? process.env.RELEASE_TAG ?? `v${project.version}`;
  const distTargets = process.env.DIST_TARGETS ?? supportedDistTargets.join(' ');

  if (!repository) {
    throw new Error(
      'Could not determine the GitHub repository. Set RELEASE_REPO=OWNER/REPO or add package.json.repository.'
    );
  }

  await run('make', ['clean'], { cwd: root });
  await run('make', ['dist', `DIST_TARGETS=${distTargets}`], {
    cwd: root,
    env: {
      ...process.env
    }
  });

  await run(path.join(root, 'releases', releaseBinaryName(project.cliName, 'linux-x64')), ['--help'], {
    cwd: root
  });
  await run(process.execPath, [path.join(root, 'scripts', 'build-release-assets.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      RELEASE_TAG: tag
    }
  });

  await rm(npmOutputDir, { force: true, recursive: true });
  await rm(npmCacheDir, { force: true, recursive: true });
  await rm(homebrewOutputDir, { force: true, recursive: true });
  await mkdir(npmOutputDir, { recursive: true });
  await mkdir(npmCacheDir, { recursive: true });
  await mkdir(homebrewOutputDir, { recursive: true });

  await run('npm', ['pack', '--pack-destination', npmOutputDir], {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir
    }
  });

  const manifest = JSON.parse(await readFile(releaseManifestPath, 'utf8'));
  const formula = renderHomebrewFormula({
    cliName: project.cliName,
    description: project.description,
    license: project.license,
    manifest,
    packageName: project.packageName,
    repository
  });
  await writeFile(formulaPath, formula);

  await validateOutputs({
    formula,
    formulaPath,
    project,
    releaseManifestPath,
    root
  });

  console.log('[release-verify] Release candidate artifacts are ready.');
  console.log(`[release-verify] GitHub release assets: ${path.join(distRoot, 'release-assets')}`);
  console.log(`[release-verify] npm package: ${npmOutputDir}`);
  console.log(`[release-verify] Homebrew formula: ${formulaPath}`);
}

async function validateOutputs({ formula, formulaPath, project, releaseManifestPath, root }) {
  const distRoot = path.join(root, 'dist');
  const npmOutputDir = path.join(distRoot, 'npm');

  await assertExists(releaseManifestPath);
  const manifest = JSON.parse(await readFile(releaseManifestPath, 'utf8'));

  for (const target of supportedDistTargets) {
    const artifact = manifest.artifacts?.[target];
    if (!artifact)
      throw new Error(`Release manifest is missing ${target}.`);

    await assertExists(path.join(distRoot, 'release-assets', artifact.archive));
  }

  for (const target of supportedDistTargets) {
    const archiveName = releaseArchiveName(project.cliName, target);
    if (!formula.includes(archiveName))
      throw new Error(`Rendered Homebrew formula does not reference ${archiveName}.`);
  }

  await assertExists(path.join(npmOutputDir, `${project.packageName}-${project.version}.tgz`));
  await assertExists(formulaPath);
}

async function assertExists(filePath) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`Expected file was not created: ${filePath}`);
  }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildReleaseCandidate().catch((error) => {
    console.error(`[release-verify] ${error.message}`);
    process.exitCode = 1;
  });
}
