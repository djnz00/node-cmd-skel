import { execFile, spawn } from 'node:child_process';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFile_ = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const exemptPathsPath = path.join(__dirname, 'fixtures', 'newcmd', 'exempt-paths.txt');
const tempDirs = [];

describe('scripts/newcmd', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      await rm(tempDirs.pop(), { force: true, recursive: true });
    }
  });

  it('can bootstrap a new repo from the base skeleton with gh and tar before rebranding it', async () => {
    const sourceDir = await createFixtureRepo(
      'node-cmd-skel',
      'git@github.com:djnz00/node-cmd-skel.git'
    );
    const { binDir, ghLogPath, tarLogPath } = await createBootstrapWrappers(path.dirname(sourceDir));
    const input = 'ship-it\nacme/tools\n';

    await runScript('./scripts/newcmd', [], {
      cwd: sourceDir,
      env: {
        ...process.env,
        NEWCMD_TEST_GH_LOG: ghLogPath,
        NEWCMD_TEST_GH_OWNER: 'acme',
        NEWCMD_TEST_HARNESS: '1',
        NEWCMD_TEST_TAR_LOG: tarLogPath,
        PATH: `${binDir}:${process.env.PATH}`
      },
      input
    });

    const repoDir = path.join(path.dirname(sourceDir), 'ship-it');

    expect(await readFile(path.join(sourceDir, 'package.json'), 'utf8')).toContain(
      '"name": "node-cmd-skel"'
    );
    expect(await readFile(path.join(repoDir, 'package.json'), 'utf8')).toContain('"name": "ship-it"');
    expect(await readFile(path.join(repoDir, 'README.md'), 'utf8')).toContain(
      'https://github.com/acme/ship-it'
    );
    expect(await readFile(path.join(repoDir, 'docs', 'distribution.md'), 'utf8')).toContain(
      'acme/homebrew-tools'
    );
    await expect(stat(path.join(repoDir, 'ship-it'))).resolves.toBeDefined();

    expect(await readFile(ghLogPath, 'utf8')).toContain('repo create ship-it --public --clone');

    const tarLog = await readFile(tarLogPath, 'utf8');
    expect(tarLog).toContain('-cf - -T');
    expect(tarLog).toContain('-xf -');

    const oldNameMatches = await trackedNameMatches(repoDir, 'node-cmd-skel');
    expect(oldNameMatches).toBe('');
  });

  it('rewrites command, repo, and tap names while keeping dedicated tests under the harness', async () => {
    const repoDir = await createFixtureRepo('ship-it', 'git@github.com:acme/ship-it.git');
    const input = 'acme/tools\n';

    await runScript('./scripts/newcmd', [], {
      cwd: repoDir,
      env: {
        ...process.env,
        NEWCMD_TEST_HARNESS: '1'
      },
      input
    });

    expect(await readFile(path.join(repoDir, 'package.json'), 'utf8')).toContain('"name": "ship-it"');
    expect(await readFile(path.join(repoDir, 'README.md'), 'utf8')).toContain(
      'brew install acme/tools/ship-it'
    );
    expect(await readFile(path.join(repoDir, 'README.md'), 'utf8')).toContain(
      'Homebrew-acme%2Ftools'
    );
    expect(await readFile(path.join(repoDir, 'docs', 'distribution.md'), 'utf8')).toContain(
      'acme/homebrew-tools'
    );
    expect(await readFile(path.join(repoDir, 'lib', 'project.js'), 'utf8')).toContain(
      "export const cliName = 'ship-it';"
    );
    await expect(stat(path.join(repoDir, 'ship-it'))).resolves.toBeDefined();
    await expect(stat(path.join(repoDir, 'scripts', 'newcmd'))).resolves.toBeDefined();
    await expect(stat(path.join(repoDir, 'tests', 'newcmd.test.js'))).resolves.toBeDefined();

    const oldNameMatches = await trackedNameMatches(repoDir, 'node-cmd-skel');
    expect(oldNameMatches).toBe('');
  });

  it('can remove itself and its dedicated tests after a successful rename', async () => {
    const repoDir = await createFixtureRepo('alpha-tool', 'git@github.com:acme/alpha-tool.git');
    const input = 'acme/tools\nY\n';

    await runScript('./scripts/newcmd', [], {
      cwd: repoDir,
      env: process.env,
      input
    });

    await expect(stat(path.join(repoDir, 'alpha-tool'))).resolves.toBeDefined();
    await expect(stat(path.join(repoDir, 'scripts', 'newcmd'))).rejects.toBeDefined();
    await expect(stat(path.join(repoDir, 'tests', 'newcmd.test.js'))).rejects.toBeDefined();
    await expect(stat(path.join(repoDir, 'tests', 'fixtures', 'newcmd'))).rejects.toBeDefined();

    const readme = await readFile(path.join(repoDir, 'README.md'), 'utf8');
    expect(readme).not.toContain('./scripts/newcmd');
  });
});

async function createFixtureRepo(repoName, originUrl) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'node-cmd-skel-newcmd-'));
  const repoDir = path.join(tempRoot, repoName);

  tempDirs.push(tempRoot);
  await cp(rootDir, repoDir, {
    filter(source) {
      const basename = path.basename(source);
      return !['.codex', '.git', 'dist', 'node_modules'].includes(basename);
    },
    recursive: true
  });

  await execFile_('git', ['init', '-b', 'main'], { cwd: repoDir });
  await execFile_('git', ['remote', 'add', 'origin', originUrl], { cwd: repoDir });
  await execFile_('git', ['add', '.'], { cwd: repoDir });

  return repoDir;
}

async function trackedNameMatches(repoDir, name) {
  const exemptPaths = (await readFile(exemptPathsPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const trackedPaths = (await listRepoFiles(repoDir)).filter((filePath) => !exemptPaths.includes(filePath));

  if (trackedPaths.length === 0)
    return '';

  const matches = [];

  for (const relativePath of trackedPaths) {
    const contents = await readFile(path.join(repoDir, relativePath), 'utf8');
    const lines = contents.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(name))
        matches.push(`${relativePath}:${index + 1}:${lines[index]}`);
    }
  }

  return matches.join('\n');
}

async function listRepoFiles(repoDir, relativeDir = '') {
  const directoryPath = path.join(repoDir, relativeDir);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const filePaths = [];

  for (const entry of entries) {
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      if (['.git', 'coverage', 'dist', 'node_modules'].includes(entry.name))
        continue;

      filePaths.push(...(await listRepoFiles(repoDir, relativePath)));
      continue;
    }

    filePaths.push(relativePath);
  }

  return filePaths;
}

async function createBootstrapWrappers(parentDir) {
  const binDir = path.join(parentDir, 'test-bin');
  const ghLogPath = path.join(parentDir, 'gh.log');
  const tarLogPath = path.join(parentDir, 'tar.log');
  const realTarPath = await commandPath('tar');

  await mkdir(binDir, { recursive: true });
  await writeFile(
    path.join(binDir, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$*" >> "${ghLogPath}"

if [[ "\${1:-}" != 'repo' || "\${2:-}" != 'create' ]]; then
  echo "unexpected gh invocation: $*" >&2
  exit 1
fi

repo_input="\${3:-}"
repo_name="\${repo_input##*/}"
repo_owner="\${repo_input%%/*}"

if [[ "\${repo_owner}" == "\${repo_input}" ]]; then
  repo_owner="\${NEWCMD_TEST_GH_OWNER:-test-user}"
fi

repo_dir="\${PWD}/\${repo_name}"

git init -b main "\${repo_dir}" >/dev/null
git -C "\${repo_dir}" remote add origin "git@github.com:\${repo_owner}/\${repo_name}.git"
`,
    'utf8'
  );
  await writeFile(
    path.join(binDir, 'tar'),
    `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$*" >> "${tarLogPath}"
exec "${realTarPath}" "$@"
`,
    'utf8'
  );

  await chmod(path.join(binDir, 'gh'), 0o755);
  await chmod(path.join(binDir, 'tar'), 0o755);

  return { binDir, ghLogPath, tarLogPath };
}

async function commandPath(commandName) {
  const { stdout } = await execFile_('bash', ['-lc', `command -v ${commandName}`]);
  return stdout.trim();
}

function runScript(command, args, { cwd, env, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
        )
      );
    });

    child.stdin.end(input);
  });
}
