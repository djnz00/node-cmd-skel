import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile_ = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, '..');

export const supportedDistTargets = ['linux-x64', 'macos-x64', 'macos-arm64'];

export async function readPackageJson(rootDir = defaultRootDir) {
  return JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
}

export async function readProjectMeta({ packageJson, rootDir = defaultRootDir } = {}) {
  const source = packageJson ?? (await readPackageJson(rootDir));
  const cliName = Object.keys(source.bin ?? {})[0] ?? source.name;
  const repository = parseGitHubRepository(source.repository?.url ?? source.repository);

  return {
    cliName,
    description: source.description,
    formulaClassName: packageNameToFormulaClassName(source.name),
    formulaFileName: `${source.name}.rb`,
    license: source.license ?? 'MIT',
    packageJson: source,
    packageName: source.name,
    releaseRepository: repository?.slug ?? (await inferRepositoryFromOrigin({ rootDir })),
    version: source.version
  };
}

export function releaseBinaryName(cliName, target) {
  return `${cliName}-${target}`;
}

export function releaseArchiveName(cliName, target) {
  return `${cliName}-${target}.tar.gz`;
}

export function packageNameToFormulaClassName(packageName) {
  const parts = String(packageName)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (parts.length === 0)
    throw new Error(`Cannot derive a Homebrew formula class name from ${packageName}.`);

  return parts
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('');
}

export function parseGitHubRepository(repositoryValue) {
  if (typeof repositoryValue !== 'string' || repositoryValue.length === 0)
    return null;

  const match = /github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/.exec(
    repositoryValue
  );

  if (!match?.groups)
    return null;

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
    slug: `${match.groups.owner}/${match.groups.repo}`
  };
}

export function parseDistTargets(rawTargets, defaults = ['linux-x64', 'macos-x64']) {
  const values = (rawTargets || defaults.join(' '))
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0)
    throw new Error('No dist targets were provided.');

  const unsupported = values.filter((value) => !supportedDistTargets.includes(value));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported dist target(s): ${unsupported.join(', ')}. ` +
        `Supported targets: ${supportedDistTargets.join(', ')}`
    );
  }

  return values;
}

export function assetUrl(repository, tag, archive) {
  return `https://github.com/${repository}/releases/download/${tag}/${archive}`;
}

export async function inferRepositoryFromOrigin({ rootDir = defaultRootDir } = {}) {
  try {
    const { stdout } = await execFile_('git', ['remote', 'get-url', 'origin'], { cwd: rootDir });
    const parsed = parseGitHubRepository(stdout.trim());
    return parsed?.slug ?? null;
  } catch {
    return null;
  }
}
