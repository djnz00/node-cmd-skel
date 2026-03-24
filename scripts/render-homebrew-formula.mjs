import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assetUrl,
  packageNameToFormulaClassName,
  readProjectMeta
} from './project-meta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, '..');

export function requireArtifact(manifest, target) {
  const artifact = manifest.artifacts?.[target];

  if (!artifact)
    throw new Error(`Missing release artifact for ${target}.`);

  return artifact;
}

export function renderHomebrewFormula({
  cliName,
  description,
  license = 'MIT',
  manifest,
  packageName = cliName,
  repository
}) {
  const linux = requireArtifact(manifest, 'linux-x64');
  const macosX64 = requireArtifact(manifest, 'macos-x64');
  const macosArm64 = requireArtifact(manifest, 'macos-arm64');
  const formulaClassName = packageNameToFormulaClassName(packageName);
  const homepage = `https://github.com/${repository}`;

  return [
    `class ${formulaClassName} < Formula`,
    `  desc ${JSON.stringify(description)}`,
    `  homepage "${homepage}"`,
    `  license "${license}"`,
    `  version "${manifest.version}"`,
    '',
    '  on_macos do',
    '    if Hardware::CPU.arm?',
    `      url "${assetUrl(repository, manifest.tag, macosArm64.archive)}"`,
    `      sha256 "${macosArm64.sha256}"`,
    '    else',
    `      url "${assetUrl(repository, manifest.tag, macosX64.archive)}"`,
    `      sha256 "${macosX64.sha256}"`,
    '    end',
    '  end',
    '',
    '  on_linux do',
    `    url "${assetUrl(repository, manifest.tag, linux.archive)}"`,
    `    sha256 "${linux.sha256}"`,
    '  end',
    '',
    '  def install',
    `    bin.install "${cliName}"`,
    '  end',
    '',
    '  test do',
    `    assert_match "Usage:", shell_output("#{bin}/${cliName} --help")`,
    '  end',
    'end',
    ''
  ].join('\n');
}

export function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifest = argv[++index];
      continue;
    }
    if (arg === '--repo') {
      options.repo = argv[++index];
      continue;
    }
    if (arg === '--license') {
      options.license = argv[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.manifest || !options.repo) {
    throw new Error(
      'Usage: node scripts/render-homebrew-formula.mjs --manifest FILE --repo OWNER/REPO'
    );
  }

  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  const project = await readProjectMeta({ rootDir: defaultRootDir });
  const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
  const formula = renderHomebrewFormula({
    cliName: project.cliName,
    description: project.description,
    license: options.license ?? project.license,
    manifest,
    packageName: project.packageName,
    repository: options.repo
  });

  process.stdout.write(formula);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[formula] ${error.message}`);
    process.exitCode = 1;
  });
}
