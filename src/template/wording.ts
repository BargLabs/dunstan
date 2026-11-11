// The phrases that depend on who reads them. `dunstan template` and the MCP tool
// dunstan_template_handback share one core (src/template/run.ts), and `dunstan check` and the MCP
// tool dunstan_check_handback share the remedy lines (src/remedy/remedies.ts). An instruction in
// that shared text names a command and its flags for the command line, and a tool and its inputs
// for an MCP caller, which runs no shell and has no flags.
//
// Each pair's `cli` text is the command line's text, unchanged; its `mcp` text says the same for a
// tool caller. Everything else in a note, an error or a remedy line reads the same for both, so the
// two wordings differ only by this table: src/mcp/template-parity.test.ts and src/mcp/parity.test.ts
// rebuild each MCP line from the CLI's by replacing every `cli` text with its `mcp` text, and fail
// on any other difference.
//
// The caller is passed in (TemplateRequest.caller, RemedyContext.caller), never guessed. Text
// reachable only from the command line (`--tests-junit`, which the tool has no form of) stays in its
// module.

export type Caller = 'cli' | 'mcp';

export interface Phrase {
  readonly cli: string;
  readonly mcp: string;
}

export const PHRASES = {
  // The notes of a template.
  again: {
    cli: 'run dunstan template again',
    mcp: 'call dunstan_template_handback again',
  },
  againCi: {
    cli: 'run dunstan template --tests-ci again',
    mcp: 'call dunstan_template_handback again with tests.from "ci"',
  },
  againCiSentence: {
    cli: 'Run dunstan template --tests-ci again',
    mcp: 'Call dunstan_template_handback again with tests.from "ci"',
  },
  ciOnceFinished: {
    cli: 'run dunstan template --tests-ci once CI has finished',
    mcp: 'call dunstan_template_handback with tests.from "ci" once CI has finished',
  },
  noTests: {
    cli: "tests are not declared. To declare CI's counts, run dunstan template again with --tests-ci --tests-command <cmd> --tests-workflow <path> --tests-job <name> once CI has finished on your last push; it reads the JUnit record CI published (docs/ci-test-records.md). For a run made only locally, --tests-local <JUnit XML file> --tests-command <cmd> declares it as one. --tests-junit <file> with --tests-command, --tests-workflow, --tests-job, --tests-artifact and --tests-artifact-path declares a local file's counts against a CI record.",
    mcp: 'tests are not declared. To declare CI\'s counts, call dunstan_template_handback again with tests { from: "ci", command, workflow, job } once CI has finished on your last push; it reads the JUnit record CI published (docs/ci-test-records.md). For a run made only locally, tests { from: "local", junit, command } declares it as one.',
  },

  // The errors of a template.
  base: {
    cli: 'pass --base <ref>',
    mcp: 'give base',
  },
  baseName: {
    cli: '--base',
    mcp: 'base',
  },
  repo: {
    cli: 'pass --repo <owner/name>',
    mcp: 'give tests.repository (owner/name)',
  },
  localFile: {
    cli: '--tests-local',
    mcp: 'tests.junit',
  },

  // The remedy lines (src/remedy/remedies.ts).
  templateWrites: {
    cli: 'dunstan template writes it',
    mcp: 'dunstan_template_handback writes it',
  },
  templateCiFills: {
    cli: 'dunstan template --tests-ci fills them',
    mcp: 'dunstan_template_handback with tests.from "ci" fills them',
  },
  templateCiAfter: {
    cli: 'run dunstan template --tests-ci after CI has finished on your last push',
    mcp: 'call dunstan_template_handback with tests.from "ci" after CI has finished on your last push',
  },
} as const satisfies Record<string, Phrase>;

export type PhraseKey = keyof typeof PHRASES;

// The phrase `key` as `caller` reads it.
export function phrase(caller: Caller, key: PhraseKey): string {
  return PHRASES[key][caller];
}
