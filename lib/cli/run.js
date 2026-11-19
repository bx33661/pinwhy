import path from 'node:path';
import { closest, parseArgs } from './args.js';
import { COMMANDS } from './commands.js';
import { usage } from './help.js';
import { commandHelp, commandHelpFor } from './command-help.js';
import { createInvocation, fail, printError } from './invocation.js';
import { createQueryCommands } from './query-commands.js';
import { createMutationCommands } from './mutation-commands.js';
import { createIntegrationCommands } from './integration-commands.js';
import { createFileCommands } from './file-commands.js';

/** Parse and validate before selecting any command that can initialize or install. */
export async function runCli(argv, installation) {
  const delimiter = argv.indexOf('--');
  const options = delimiter < 0 ? argv : argv.slice(0, delimiter);
  const json = options.includes('--json') || (argv[0] === 'context' && !options.includes('--markdown') && !options.includes('--md'));
  try {
    await execute(argv, options, installation, json);
  } catch (error) {
    printError(error, json);
  }
}

function unknownCommand(name) {
  const suggestion = closest(name, Object.keys(COMMANDS).filter((key) => !key.startsWith('-')));
  return fail(`Unknown command ${name}${suggestion ? `; did you mean ${suggestion}?` : ''} (run pinwhy help for usage)`, {
    code: 'unknown_command', ...(suggestion ? { suggestion } : {}),
  });
}

function showHelp(topic, flags) {
  if (!topic) return usage({ all: !!flags.all });
  if (!commandHelpFor(topic)) return unknownCommand(topic);
  return console.log(commandHelp(topic));
}

async function execute(argv, options, installation, json) {
  const cmd = argv[0];
  if (options.includes('--help') || options.includes('-h')) {
    if (!cmd || ['--help', '-h'].includes(cmd)) return usage({ all: options.includes('--all') });
    if (!Object.hasOwn(COMMANDS, cmd)) return unknownCommand(cmd);
    const { args, flags } = parseArgs(argv.slice(1), cmd, { help: true });
    const topic = cmd === 'help' ? args.join(' ') : `${cmd}${COMMANDS[cmd].subcommands && args[0] ? ` ${args[0]}` : ''}`;
    return showHelp(topic, flags);
  }
  if (cmd === undefined) return usage();
  // Options belong to a command; keep the documented placement rule.
  if (cmd.startsWith('--') && cmd !== '--version') {
    return fail(`Options must follow a command, for example: pinwhy <command> ${cmd.split('=')[0]} …`);
  }
  if (!Object.hasOwn(COMMANDS, cmd)) return unknownCommand(cmd);
  let parsed;
  try { parsed = parseArgs(argv.slice(1), cmd); }
  catch (error) { return fail(error); }
  const { args, flags } = parsed;
  const invocation = createInvocation({
    root: flags.cwd ? path.resolve(String(flags.cwd)) : null,
    noInit: !!flags['no-init'], json,
  });
  invocation.validateInvocation(cmd, args, flags);

  const query = createQueryCommands(invocation);
  const mutation = createMutationCommands(invocation);
  const integration = createIntegrationCommands(invocation, installation);
  const files = createFileCommands(invocation, installation);
  const nodeShorthands = Object.fromEntries(
    ['start', 'goal', 'intent', 'fact', 'vuln', 'hint'].map((type) => [type, (a, f) => mutation.addSimple(type, a, f)]),
  );
  const stateCommands = Object.fromEntries(
    ['done', 'block', 'revive'].map((state) => [state, (a, f) => mutation.cmdState(state, a, f)]),
  );
  const handlers = {
    help: (a, f) => showHelp(a.join(' '), f),
    '-v': integration.cmdVersion,
    '--version': integration.cmdVersion,
    version: integration.cmdVersion,
    init: mutation.cmdInit,
    setup: integration.cmdSetup,
    status: query.cmdStatus,
    doctor: integration.cmdDoctor,
    node: (a, f) => mutation.addSimple(a[1], a.slice(2), f),
    ...nodeShorthands,
    compact: mutation.cmdCheckpoint,
    checkpoint: mutation.cmdCheckpoint,
    focus: mutation.cmdCursor,
    cursor: mutation.cmdCursor,
    here: query.cmdHere,
    activity: query.cmdActivity,
    promote: mutation.cmdPromote,
    batch: mutation.cmdBatch,
    ...stateCommands,
    edit: mutation.cmdEdit,
    link: mutation.cmdLink,
    unlink: mutation.cmdUnlink,
    remove: mutation.cmdRemove,
    rm: mutation.cmdRemove,
    ls: query.cmdList,
    list: query.cmdList,
    show: query.cmdShow,
    search: query.cmdSearch,
    history: query.cmdHistory,
    changes: query.cmdChanges,
    backup: files.cmdBackup,
    restore: files.cmdRestore,
    receipt: query.cmdReceipt,
    capabilities: integration.cmdCapabilities,
    tree: query.cmdTree,
    digest: query.cmdDigest,
    context: query.cmdContext,
    lint: query.cmdLint,
    tail: query.cmdTail,
    serve: integration.cmdServe,
    stop: integration.cmdStop,
    export: files.cmdExport,
    reset: mutation.cmdReset,
    hooks: integration.cmdHooks,
    service: integration.cmdService,
    skill: integration.cmdSkill,
    launcher: integration.cmdLauncher,
    release: integration.cmdRelease,
    hook: (a, f) => integration.hookEntry(a[0], a.slice(1), f),
  };

  if (!Object.hasOwn(handlers, cmd)) unknownCommand(cmd);
  await handlers[cmd](args, flags);
  invocation.flushWarnings();
}
