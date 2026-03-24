import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  rename,
  stat,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseDistTargets, readProjectMeta, releaseBinaryName } from './project-meta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releasesDir = path.join(rootDir, 'releases');
const distCacheDir = resolveDistCacheDir();
const nodeVersion = process.versions.node;
const seaBlobResourceName = 'NODE_SEA_BLOB';
const seaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const seaMachoSegmentName = 'NODE_SEA';
const postjectCliPath = path.join(rootDir, 'node_modules', 'postject', 'dist', 'cli.js');
const targets = new Map([
  ['linux-x64', { archivePlatform: 'linux-x64' }],
  ['macos-x64', { archivePlatform: 'darwin-x64' }],
  ['macos-arm64', { archivePlatform: 'darwin-arm64' }]
]);

export async function buildDist({
  rawTargets = process.env.DIST_TARGETS,
  root = rootDir
} = {}) {
  assertSupportedNodeVersion();

  const project = await readProjectMeta({ rootDir: root });
  const distTargets = parseDistTargets(rawTargets);
  const nodeDistBaseUrl = `https://nodejs.org/dist/v${nodeVersion}`;
  const shasums = await fetchShasums(nodeDistBaseUrl, distCacheDir);
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'node-cmd-skel-dist-'));

  try {
    await mkdir(releasesDir, { recursive: true });
    await mkdir(distCacheDir, { recursive: true });

    log(`Bundling CLI with esbuild for ${distTargets.join(', ')}`);
    const bundlePath = path.join(workDir, `${project.cliName}.bundle.cjs`);
    const entryPointPath = path.join(workDir, 'dist-entry.mjs');
    const cliModulePath = JSON.stringify(path.join(root, 'lib', 'cli.js'));

    await writeFile(
      entryPointPath,
      [
        `import { main } from ${cliModulePath};`,
        '',
        'Promise.resolve(main())',
        '  .then((exitCode) => {',
        "    if (typeof exitCode === 'number') {",
        '      process.exitCode = exitCode;',
        '    }',
        '  })',
        '  .catch((error) => {',
        '    setImmediate(() => {',
        '      throw error;',
        '    });',
        '  });',
        ''
      ].join('\n')
    );

    await build({
      absWorkingDir: root,
      bundle: true,
      entryPoints: [entryPointPath],
      format: 'cjs',
      outfile: bundlePath,
      platform: 'node',
      target: ['node24']
    });

    for (const distTarget of distTargets) {
      await buildExecutable({
        bundlePath,
        nodeDistBaseUrl,
        project,
        shasums,
        targetConfig: targets.get(distTarget),
        targetName: distTarget,
        workDir
      });
    }

    log(`Wrote ${distTargets.length} executable(s) to ${releasesDir}`);
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

function assertSupportedNodeVersion() {
  const [major, minor] = nodeVersion.split('.').map(Number);

  if (major > 25 || (major === 25 && minor >= 5))
    return;

  throw new Error('make dist requires Node.js 25.5 or newer for SEA builds.');
}

async function fetchShasums(nodeDistBaseUrl, cacheDir) {
  const cachePath = path.join(cacheDir, `node-v${nodeVersion}`, 'SHASUMS256.txt');

  if (await fileExists(cachePath)) {
    log('Using cached SHASUMS256.txt');
    return readFile(cachePath, 'utf8');
  }

  const response = await fetch(`${nodeDistBaseUrl}/SHASUMS256.txt`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Node.js checksums from ${nodeDistBaseUrl}: ` +
        `${response.status} ${response.statusText}`
    );
  }

  const text = await response.text();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, text);
  return text;
}

async function buildExecutable({
  bundlePath,
  nodeDistBaseUrl,
  project,
  shasums,
  targetConfig,
  targetName,
  workDir
}) {
  const nodeBinary = await ensureRuntimeReady({
    nodeDistBaseUrl,
    shasums,
    targetConfig,
    targetName
  });
  const executablePath = path.join(releasesDir, releaseBinaryName(project.cliName, targetName));
  const configPath = path.join(workDir, `${releaseBinaryName(project.cliName, targetName)}.sea.json`);
  const usePostjectFallback = shouldUsePostjectFallback(targetName);

  await assertFileExists(nodeBinary);
  await rm(executablePath, { force: true });

  if (usePostjectFallback) {
    await buildExecutableWithPostject({
      bundlePath,
      configPath,
      executablePath,
      nodeBinary,
      targetConfig
    });
  } else {
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          disableExperimentalSEAWarning: true,
          executable: nodeBinary,
          main: bundlePath,
          mainFormat: 'commonjs',
          output: executablePath,
          useCodeCache: false,
          useSnapshot: false
        },
        null,
        2
      )}\n`
    );

    log(`Building ${path.basename(executablePath)}`);
    await run(process.execPath, ['--build-sea', configPath], { cwd: rootDir });

    if (targetName.startsWith('macos-') && process.platform === 'darwin')
      await run('codesign', ['--force', '--sign', '-', executablePath], { cwd: rootDir });
  }

  await chmod(executablePath, 0o755);

  if (targetName.startsWith('macos-') && process.platform !== 'darwin') {
    log(
      `Generated unsigned macOS binary ${path.basename(executablePath)}; ` +
        `re-sign it on macOS before distribution with: ` +
        `codesign --sign - ${executablePath}`
    );
  }
}

async function buildExecutableWithPostject({
  bundlePath,
  configPath,
  executablePath,
  nodeBinary,
  targetConfig
}) {
  const blobPath = path.join(path.dirname(configPath), `${path.basename(executablePath)}.blob`);

  await assertFileExists(postjectCliPath);
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        disableExperimentalSEAWarning: true,
        main: bundlePath,
        mainFormat: 'commonjs',
        output: blobPath,
        useCodeCache: false,
        useSnapshot: false
      },
      null,
      2
    )}\n`
  );

  log(`Building ${path.basename(executablePath)} with --experimental-sea-config and postject`);
  await run(process.execPath, ['--experimental-sea-config', configPath], { cwd: rootDir });
  await assertFileExists(blobPath);

  await copyFile(nodeBinary, executablePath);
  await run('codesign', ['--remove-signature', executablePath], { cwd: rootDir });
  await run(
    process.execPath,
    [
      postjectCliPath,
      executablePath,
      seaBlobResourceName,
      blobPath,
      '--sentinel-fuse',
      seaFuse,
      '--macho-segment-name',
      seaMachoSegmentName
    ],
    { cwd: rootDir }
  );
  await run('codesign', ['--force', '--sign', '-', executablePath], { cwd: rootDir });
}

function resolveArchive(shasums, archivePlatform) {
  const prefix = `node-v${nodeVersion}-${archivePlatform}`;

  for (const line of shasums.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line.trim());
    if (!match)
      continue;

    const [, sha256, filename] = match;
    if (filename === `${prefix}.tar.xz` || filename === `${prefix}.tar.gz`)
      return { filename, sha256 };
  }

  throw new Error(`Could not find a Node.js archive for ${archivePlatform} in SHASUMS256.txt.`);
}

async function ensureArchiveCached({ archive, cacheDir, nodeDistBaseUrl }) {
  const archivePath = path.join(cacheDir, `node-v${nodeVersion}`, 'archives', archive.filename);

  if (await fileExists(archivePath)) {
    try {
      await verifyArchiveChecksum(archivePath, archive.sha256);
      log(`Using cached ${archive.filename}`);
      return archivePath;
    } catch {
      log(`Discarding invalid cached ${archive.filename}`);
      await rm(archivePath, { force: true });
    }
  }

  await mkdir(path.dirname(archivePath), { recursive: true });
  log(`Downloading ${archive.filename}`);
  await downloadFile(`${nodeDistBaseUrl}/${archive.filename}`, archivePath);
  await verifyArchiveChecksum(archivePath, archive.sha256);
  return archivePath;
}

async function ensureRuntimeReady({
  nodeDistBaseUrl,
  shasums,
  targetConfig,
  targetName
}) {
  const runtimeDir = resolveRuntimeDir(targetConfig);
  const nodeBinary = path.join(runtimeDir, 'bin', 'node');

  if (await fileExists(nodeBinary)) {
    log(`Using cached runtime ${path.basename(runtimeDir)}`);
    return nodeBinary;
  }

  const archive = resolveArchive(shasums, targetConfig.archivePlatform);
  const archivePath = await ensureArchiveCached({
    archive,
    cacheDir: distCacheDir,
    nodeDistBaseUrl
  });

  const runtimeParentDir = path.dirname(runtimeDir);
  await mkdir(runtimeParentDir, { recursive: true });
  const extractRoot = await mkdtemp(path.join(runtimeParentDir, `${targetName}-extract-`));

  try {
    log(`Extracting ${archive.filename}`);
    await extractArchive(archivePath, extractRoot);

    const extractedRuntimeDir = path.join(
      extractRoot,
      `node-v${nodeVersion}-${targetConfig.archivePlatform}`
    );

    await rm(runtimeDir, { force: true, recursive: true });

    try {
      await rename(extractedRuntimeDir, runtimeDir);
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY')
        throw error;
    }
  } finally {
    await rm(extractRoot, { force: true, recursive: true });
  }

  return nodeBinary;
}

function resolveRuntimeDir(targetConfig) {
  return path.join(
    distCacheDir,
    `node-v${nodeVersion}`,
    'runtimes',
    `node-v${nodeVersion}-${targetConfig.archivePlatform}`
  );
}

function shouldUsePostjectFallback(targetName) {
  return targetName === 'macos-x64' && process.platform === 'darwin';
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destinationPath));
}

async function verifyArchiveChecksum(filePath, expectedChecksum) {
  const actualChecksum = await hashFile(filePath);
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Checksum mismatch for ${path.basename(filePath)}. ` +
        `Expected ${expectedChecksum}, got ${actualChecksum}.`
    );
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

async function extractArchive(archivePath, destinationPath) {
  const args = archivePath.endsWith('.tar.xz')
    ? ['-xJf', archivePath, '-C', destinationPath]
    : ['-xzf', archivePath, '-C', destinationPath];

  await run('tar', args);
}

async function assertFileExists(filePath) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`Expected file was not created: ${filePath}`);
  }
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveDistCacheDir() {
  if (process.env.DIST_CACHE_DIR)
    return path.resolve(process.env.DIST_CACHE_DIR);

  const baseDir = process.env.XDG_CACHE_HOME
    ? path.resolve(process.env.XDG_CACHE_HOME)
    : path.join(os.homedir(), '.cache');

  return path.join(baseDir, 'node-cmd-skel', 'dist');
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

function log(message) {
  console.log(`[dist] ${message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildDist().catch((error) => {
    console.error(`[dist] ${error.message}`);
    process.exitCode = 1;
  });
}
