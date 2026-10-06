// The Action's inputs (action.yml), read from the INPUT_* variables the runner sets. Anything the
// Action cannot use is an ActionError, which the Action reports as a failure conclusion with the
// reason in the summary: a missing or malformed input never falls back to a guess.

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

export type ReportSource =
  | { kind: 'pr-body' }
  | { kind: 'comment'; author: string }
  | { kind: 'file'; path: string };

export type UnverifiableConclusion = 'failure' | 'neutral';

export interface ActionInputs {
  reportSource: ReportSource;
  unverifiableConclusion: UnverifiableConclusion;
  sign?: { keyPath: string; signer: string };
  // Run the advisory extractor (DRAFT 0.2.0). It never changes the verdict or the conclusion.
  advisory: boolean;
}

// A GitHub login, or an app's bot login such as `my-agent[bot]`.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/;

// The runner passes input `report-source` as INPUT_REPORT-SOURCE: spaces become underscores, the
// name is upper-cased and hyphens are kept.
export function input(env: Record<string, string | undefined>, name: string): string {
  return (env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim();
}

export function parseReportSource(value: string): ReportSource {
  if (value === '') {
    throw new ActionError(
      'report-source is required (pr-body, comment:<author-login> or file:<path>); the Action never guesses where a report is',
    );
  }
  if (value === 'pr-body') return { kind: 'pr-body' };
  if (value.startsWith('comment:')) {
    const author = value.slice('comment:'.length);
    if (!LOGIN.test(author)) {
      throw new ActionError(`report-source ${value}: "${author}" is not a GitHub login`);
    }
    return { kind: 'comment', author };
  }
  if (value.startsWith('file:')) {
    const path = value.slice('file:'.length);
    if (path === '') throw new ActionError('report-source file: names no path');
    return { kind: 'file', path };
  }
  throw new ActionError(
    `report-source "${value}" is not pr-body, comment:<author-login> or file:<path>`,
  );
}

export function parseInputs(env: Record<string, string | undefined>): ActionInputs {
  const reportSource = parseReportSource(input(env, 'report-source'));

  const unverifiable = input(env, 'unverifiable-conclusion') || 'failure';
  if (unverifiable !== 'failure' && unverifiable !== 'neutral') {
    throw new ActionError(
      `unverifiable-conclusion must be failure or neutral, not "${unverifiable}"`,
    );
  }

  const keyPath = input(env, 'sign-key-path');
  const signer = input(env, 'signer');
  if ((keyPath === '') !== (signer === '')) {
    throw new ActionError('sign-key-path and signer go together');
  }

  const advisory = input(env, 'advisory') || 'false';
  if (advisory !== 'true' && advisory !== 'false') {
    throw new ActionError(`advisory must be true or false, not "${advisory}"`);
  }

  return {
    reportSource,
    unverifiableConclusion: unverifiable,
    ...(keyPath === '' ? {} : { sign: { keyPath, signer } }),
    advisory: advisory === 'true',
  };
}
