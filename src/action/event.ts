// The workflow event the Action runs under, read from GITHUB_EVENT_NAME and the payload at
// GITHUB_EVENT_PATH. It names the pull request; it is never a source of evidence (the subject is read
// from the API).

import { ActionError } from './inputs.js';

export interface ActionEvent {
  name: string;
  repository: string;
  number: number;
  // The head commit the payload names, used only to attach a failure when the pull request itself
  // cannot be read. Absent for issue_comment, whose payload does not carry it.
  headSha?: string;
  // A pull_request event from a fork: the token is read-only and cannot create a check run.
  fork: boolean;
}

type Obj = Record<string, unknown>;

function member(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Obj)[key] : undefined;
}

function fullName(side: unknown): unknown {
  return member(member(side, 'repo'), 'full_name');
}

export function readEvent(
  env: Record<string, string | undefined>,
  readFile: (path: string) => Uint8Array,
): ActionEvent {
  const name = env.GITHUB_EVENT_NAME ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';
  const path = env.GITHUB_EVENT_PATH ?? '';
  if (repository === '' || path === '') {
    throw new ActionError('GITHUB_REPOSITORY or GITHUB_EVENT_PATH is not set; not a workflow run');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(readFile(path)));
  } catch (e) {
    throw new ActionError(`cannot read the event payload ${path}: ${(e as Error).message}`);
  }

  if (name === 'pull_request' || name === 'pull_request_target') {
    const pr = member(payload, 'pull_request');
    const number = member(pr, 'number');
    if (typeof number !== 'number') throw new ActionError(`${name} payload has no pull request`);
    const headSha = member(member(pr, 'head'), 'sha');
    const head = fullName(member(pr, 'head'));
    const base = fullName(member(pr, 'base'));
    return {
      name,
      repository,
      number,
      ...(typeof headSha === 'string' ? { headSha } : {}),
      // A deleted fork has no head repository; it is still not this repository.
      fork: name === 'pull_request' && head !== base,
    };
  }
  if (name === 'issue_comment') {
    const issue = member(payload, 'issue');
    const number = member(issue, 'number');
    if (member(issue, 'pull_request') === undefined || typeof number !== 'number') {
      throw new ActionError('issue_comment on an issue, not a pull request; nothing to check');
    }
    return { name, repository, number, fork: false };
  }
  throw new ActionError(
    `dunstan checks a pull request: run it on pull_request, pull_request_target or issue_comment, not ${name || 'an unnamed event'}`,
  );
}
