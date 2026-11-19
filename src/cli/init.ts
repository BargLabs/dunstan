// dunstan init [--write] [--forge github|gitlab]: sets the repository at the working directory up
// for Dunstan (src/init/init.ts). Without --write it prints what it would write and changes nothing.
// The forge is GitLab when `origin` is on a host named gitlab, GitHub when it is github.com, and
// otherwise as planInit decides from the checkout. The only network read is `git ls-remote` of the
// release tag of the Action, or of the GitLab component, for the commit the gate pins.

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { GITLAB_COMPONENT_REPOSITORY } from '../init/content.js';
import {
  applyPlan,
  type Forge,
  forgeOf,
  type InitOptions,
  type Pin,
  planInit,
  renderPlan,
} from '../init/init.js';
import { CHECKER_VERSION } from '../record/checker.js';
import { type CliIo, EXIT, UsageError } from './output.js';

export const ACTION_REPOSITORY = 'https://github.com/BargLabs/dunstan';

function lsRemote(url: string, refs: string[]): string {
  return execFileSync('git', ['ls-remote', url, ...refs], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
  });
}

// The commit the release tag of `version` names, peeled when the tag is annotated: the Action's
// `v<version>` on GitHub, or the GitLab component's `<version>`.
export function resolvePin(
  version: string,
  read: (url: string, refs: string[]) => string = lsRemote,
  forge: Forge = 'github',
): Pin {
  const tag = forge === 'gitlab' ? version : `v${version}`;
  const repository = forge === 'gitlab' ? GITLAB_COMPONENT_REPOSITORY : ACTION_REPOSITORY;
  let output: string;
  try {
    output = read(repository, [`refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  } catch (e) {
    return {
      ref: tag,
      unresolved: `git ls-remote failed (${(e as Error).message.split('\n')[0]})`,
    };
  }
  const shas = new Map<string, string>();
  for (const line of output.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (sha !== undefined && ref !== undefined && /^[0-9a-f]{40}$/.test(sha)) shas.set(ref, sha);
  }
  const sha = shas.get(`refs/tags/${tag}^{}`) ?? shas.get(`refs/tags/${tag}`);
  if (sha === undefined) return { ref: tag, unresolved: `${repository} has no tag ${tag}` };
  return { ref: `${sha} # ${tag}` };
}

// The host and project path an `origin` remote URL names: scp-like (git@host:group/project.git),
// ssh:// or https://.
export function parseRemote(url: string): { host: string; path: string } | undefined {
  const t = url.trim();
  const scp = /^[\w.-]+@([\w.-]+):(?!\/)(.+?)(?:\.git)?\/?$/.exec(t);
  if (scp !== null) return { host: scp[1] as string, path: scp[2] as string };
  const full = /^(?:ssh|https?|git):\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/.exec(
    t,
  );
  if (full !== null) return { host: full[1] as string, path: full[2] as string };
  return undefined;
}

function originUrl(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return undefined;
  }
}

// The default branch as the `origin` remote's HEAD names it locally (`origin/main` -> `main`), read
// without the network; undefined when the clone has no such ref.
function defaultBranch(cwd: string): string | undefined {
  try {
    const ref = execFileSync(
      'git',
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
    return ref.startsWith('origin/') && ref.length > 'origin/'.length ? ref.slice(7) : undefined;
  } catch {
    return undefined;
  }
}

function topLevel(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return undefined;
  }
}

export async function init(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: { write: { type: 'boolean', default: false }, forge: { type: 'string' } },
  });
  const forge = values.forge;
  if (forge !== undefined && forge !== 'github' && forge !== 'gitlab') {
    throw new UsageError(`--forge takes github or gitlab, not ${forge}`);
  }
  const cwd = io.cwd ?? process.cwd();
  const dir = topLevel(cwd);
  if (dir === undefined) {
    io.err(`dunstan: ${cwd} is not in a git repository: run dunstan init in the repository\n`);
    return EXIT.error;
  }
  const remote = parseRemote(originUrl(dir) ?? '');
  const options: InitOptions = {};
  if (forge !== undefined) options.forge = forge;
  else if (remote?.host.includes('gitlab')) options.forge = 'gitlab';
  else if (remote?.host === 'github.com') options.forge = 'github';
  if (remote !== undefined && remote.host !== 'github.com') {
    options.gitlabProject = remote.path;
    options.gitlabHost = remote.host;
  }
  const branch = defaultBranch(dir);
  if (branch !== undefined) options.defaultBranch = branch;
  const pin = resolvePin(CHECKER_VERSION, io.lsRemote, forgeOf(dir, options));
  const plan = planInit(dir, CHECKER_VERSION, pin, options);
  if (values.write) applyPlan(dir, plan);
  io.out(`dunstan init: ${dir}\n\n${renderPlan(plan, values.write)}`);
  return 0;
}
