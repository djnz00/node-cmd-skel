import { execFile, spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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
      return !['.git', 'dist', 'node_modules', 'releases'].includes(basename);
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
  const { stdout } = await execFile_('git', ['ls-files'], { cwd: repoDir });
  const trackedPaths = (
    await Promise.all(
      stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((filePath) => !exemptPaths.includes(filePath))
        .map(async (filePath) => {
          try {
            await stat(path.join(repoDir, filePath));
            return filePath;
          } catch {
            return null;
          }
        })
    )
  )
    .filter(Boolean);

  if (trackedPaths.length === 0)
    return '';

  try {
    const { stdout: matches } = await execFile_('rg', ['-n', '--fixed-strings', name, ...trackedPaths], {
      cwd: repoDir
    });
    return matches.trim();
  } catch (error) {
    if (error.code === 1)
      return '';

    throw error;
  }
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
