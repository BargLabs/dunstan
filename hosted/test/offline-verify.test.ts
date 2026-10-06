// Acceptance (ii): `dunstan verify` on a hosted record passes offline. Here the CLI runs with every
// outbound global disabled; in CI the job `hosted-offline-verify` also runs the built CLI on the
// files this test writes (DUNSTAN_HOSTED_RECORD_OUT) inside a network namespace with no network.

import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/cli/main.js';
import { handle } from '../src/app.js';
import {
  checkRequest,
  type Emulated,
  emulators,
  fakeNetwork,
  installationPayload,
  issueKey,
  PR,
  REPO,
  scenarioReport,
  webhook,
} from './support.js';

const CHECKER = { name: 'dunstan', version: '0.1.1', digest: { sha256: 'b'.repeat(64) } };

let emulated: Emulated;
let response: { record: string; signature: string; rerun: { file: string } };

beforeAll(async () => {
  emulated = await emulators();
  const deps = { checker: CHECKER, network: fakeNetwork().fetch, now: () => new Date() };
  await handle(await webhook('installation', installationPayload('created')), emulated.env, deps);
  const key = await issueKey(emulated.env.DB);
  const answer = await handle(
    checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
    emulated.env,
    deps,
  );
  expect(answer.status).toBe(200);
  response = (await answer.json()) as typeof response;
});
afterAll(async () => {
  await emulated.mf.dispose();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function save(dir: string): { record: string; sig: string; signers: string } {
  const record = join(dir, response.rerun.file);
  writeFileSync(record, response.record);
  writeFileSync(`${record}.sig`, response.signature);
  const signers = join(dir, 'record-signers');
  copyFileSync(emulated.signing.allowedSigners, signers);
  return { record, sig: `${record}.sig`, signers };
}

describe('a hosted record, verified offline', () => {
  it('passes dunstan verify with its signature, with the network unreachable', async () => {
    const files = save(mkdtempSync(join(tmpdir(), 'dunstan-hosted-offline-')));
    const refuse = () => {
      throw new Error('network use during offline verify');
    };
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
      vi.stubGlobal(name, refuse);
    }
    const out: string[] = [];
    const code = await main(
      ['verify', files.record, '--sig', files.sig, '--allowed-signers', files.signers],
      {
        out: (t) => out.push(t),
        err: (t) => out.push(t),
        env: {},
        artifact: import.meta.url,
        readStdin: () => new Uint8Array(),
      },
    );
    expect(out.join('')).toContain('Good "dunstan-record" signature');
    expect(out.join('')).toContain('verified:');
    expect(code).toBe(0);

    // For the CI job that repeats this inside a network namespace with the built CLI.
    const target = process.env.DUNSTAN_HOSTED_RECORD_OUT;
    if (target !== undefined && target !== '') {
      mkdirSync(target, { recursive: true });
      save(target);
    }
  });

  it('fails dunstan verify when one byte of the record changes', async () => {
    const files = save(mkdtempSync(join(tmpdir(), 'dunstan-hosted-offline-')));
    writeFileSync(files.record, response.record.replace('"verdict":"pass"', '"verdict":"fail"'));
    const code = await main(
      ['verify', files.record, '--sig', files.sig, '--allowed-signers', files.signers],
      {
        out: () => {},
        err: () => {},
        env: {},
        artifact: import.meta.url,
        readStdin: () => new Uint8Array(),
      },
    );
    expect(code).not.toBe(0);
  });
});
