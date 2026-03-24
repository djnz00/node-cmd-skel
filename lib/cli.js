import { CommanderError } from 'commander';

import { createProgram } from './program.js';

export async function main({
  argv = process.argv.slice(2),
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  const normalizedArgv = normalizeArgv(argv);
  const program = createProgram({ stderr, stdout });

  if (normalizedArgv.length === 0) {
    writeLine(stderr, program.helpInformation());
    return 1;
  }

  try {
    await program.parseAsync(normalizedArgv, { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError)
      return error.exitCode;

    throw error;
  }
}

function normalizeArgv(argv) {
  return argv.map((arg) => (arg === '-?' ? '--help' : arg));
}

function writeLine(writer, text) {
  writer.write(text.endsWith('\n') ? text : `${text}\n`);
}
