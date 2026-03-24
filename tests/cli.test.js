import { describe, expect, it } from 'vitest';

import { main } from '../lib/cli.js';
import { cliVersion } from '../lib/version.js';

function createWriter() {
  const chunks = [];

  return {
    text() {
      return chunks.join('');
    },
    writer: {
      write(chunk) {
        chunks.push(String(chunk));
        return true;
      }
    }
  };
}

async function runCli(argv) {
  const stdout = createWriter();
  const stderr = createWriter();
  const exitCode = await main({
    argv,
    stderr: stderr.writer,
    stdout: stdout.writer
  });

  return {
    exitCode,
    stderr: stderr.text(),
    stdout: stdout.text()
  };
}

describe('node-cmd-skel CLI', () => {
  it('prints root help to stderr when no command is provided', async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage: node-cmd-skel');
    expect(result.stderr).toContain('skel');
    expect(result.stderr).toContain('show version');
  });

  it.each(['--help', '-h', '-?'])('prints root help with %s', async (flag) => {
    const result = await runCli([flag]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: node-cmd-skel');
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('skel');
    expect(result.stdout).toContain('Future global options belong before the subcommand name.');
  });

  it.each(['--version', '-v'])('prints the current version with %s', async (flag) => {
    const result = await runCli([flag]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(`${cliVersion}\n`);
  });

  it('prints command-specific help for skel --help', async () => {
    const result = await runCli(['skel', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: node-cmd-skel skel');
    expect(result.stdout).toContain('Skeleton notes:');
    expect(result.stdout).toContain('placeholder option for a derived command');
  });

  it('prints template guidance for skel', async () => {
    const result = await runCli(['skel']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('skel is the no-op template subcommand.');
    expect(result.stdout).toContain('lib/commands/skel.js');
  });

  it('fails unknown commands with guidance', async () => {
    const result = await runCli(['missing']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("error: unknown command 'missing'");
    expect(result.stderr).toContain('(add --help for additional information)');
  });

  it('fails invalid skel options with guidance', async () => {
    const result = await runCli(['skel', '--unknown']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("error: unknown option '--unknown'");
    expect(result.stderr).toContain('(add --help for additional information)');
  });
});
