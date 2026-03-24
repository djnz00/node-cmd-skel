import { cliName, templateCommandName } from './project.js';

export function rootAfterHelp() {
  return [
    'Extension points:',
    '  Future global options belong before the subcommand name.',
    '  Future subcommands will be listed in the Commands section above.',
    '',
    'Examples:',
    `  ${cliName} --help`,
    `  ${cliName} --version`,
    `  ${cliName} ${templateCommandName}`,
    `  ${cliName} ${templateCommandName} --help`
  ].join('\n');
}

export function skelAfterHelp() {
  return [
    'Skeleton notes:',
    '  This command is intentionally side-effect free.',
    '  Use it as the first place to add real subcommand options and behavior.',
    '',
    'Future command-specific options would live here, for example:',
    '  --example <value>  placeholder option for a derived command',
    '',
    'Examples:',
    `  ${cliName} ${templateCommandName}`,
    `  ${cliName} ${templateCommandName} --help`
  ].join('\n');
}

export function skelGuidance() {
  return [
    'skel is the no-op template subcommand.',
    'Add real options and behavior in lib/commands/skel.js when you derive a real CLI.'
  ].join('\n');
}
