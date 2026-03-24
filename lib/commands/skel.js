import { skelAfterHelp, skelGuidance } from '../help.js';
import { templateCommandName, templateCommandSummary } from '../project.js';

export function addSkelCommand(program, { stdout = process.stdout } = {}) {
  const command = program
    .command(templateCommandName)
    .summary(templateCommandSummary)
    .description('No-op template command used to demonstrate subcommand help and wiring.')
    .addHelpText('after', skelAfterHelp())
    .action(() => {
      stdout.write(`${skelGuidance()}\n`);
    });

  return command;
}
