import { Command } from 'commander';

import { rootAfterHelp } from './help.js';
import { addSkelCommand } from './commands/skel.js';
import { cliDescription, cliName } from './project.js';
import { cliVersion } from './version.js';

export function createProgram({ stderr = process.stderr, stdout = process.stdout } = {}) {
  const program = new Command();

  program
    .name(cliName)
    .description(cliDescription)
    .usage('[options] [command]')
    .version(cliVersion, '-v, --version', 'show version')
    .helpOption('-h, --help', 'show help')
    .helpCommand(false)
    .showHelpAfterError('(add --help for additional information)')
    .showSuggestionAfterError(false)
    .configureOutput({
      writeOut: (chunk) => stdout.write(chunk),
      writeErr: (chunk) => stderr.write(chunk),
      outputError: (chunk, write) => write(chunk)
    })
    .exitOverride()
    .addHelpText('after', rootAfterHelp());

  addSkelCommand(program, { stdout });

  return program;
}
