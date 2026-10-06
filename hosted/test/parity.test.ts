// Acceptance (i): the hosted tier is the same checker. For every checker fixture, with the evidence
// reader stubbed to the fixture's evidence, the hosted handler's claims, verdict and digests equal
// those of `dunstan check` on the same report, and both equal the acceptance run's (the line CI
// compares across machines). The hosted record also verifies offline and carries a good signature.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  determinismLine,
  FIXTURE_REPOSITORY,
  type FixtureCase,
  loadCases,
  runCase,
} from '../../src/acceptance/fixtures.js';
import { main } from '../../src/cli/main.js';
import type { EvidenceReaders } from '../../src/pipeline/check-pull-request.js';
import type { DunstanRecord } from '../../src/record/build.js';
import { verifyRecord } from '../../src/record/verify.js';
import { handle } from '../src/app.js';
import { utf8 } from '../src/encoding.js';
import { verifySsh } from '../src/sshsig.js';
import {
  checkRequest,
  type Emulated,
  emulators,
  fakeNetwork,
  installationPayload,
  issueKey,
  webhook,
} from './support.js';

const cases = [...loadCases('controls'), ...loadCases('planted')];
const CHECKER = { name: 'dunstan', version: '0.1.3', digest: { sha256: '0'.repeat(64) } };

function stubbedReaders(c: FixtureCase): EvidenceReaders {
  return {
    pullRequest: async () => ({
      evidence: structuredClone(c.evidence.pullRequest),
      repository: FIXTURE_REPOSITORY,
      body: null,
    }),
    evidence: async () => structuredClone(c.evidence),
  };
}

async function viaCli(c: FixtureCase, dir: string): Promise<DunstanRecord> {
  const out = join(dir, `${c.set}-${c.name}.json`);
  const report = join(dir, `${c.set}-${c.name}.md`);
  writeFileSync(report, c.report);
  await main(
    [
      'check',
      '--repo',
      FIXTURE_REPOSITORY,
      '--pr',
      String(c.evidence.pullRequest.number),
      '--report-file',
      report,
      '--out',
      out,
    ],
    {
      out: () => {},
      err: () => {},
      env: {},
      artifact: import.meta.url,
      readers: () => stubbedReaders(c),
      readStdin: () => new Uint8Array(),
    },
  );
  return JSON.parse(readFileSync(out, 'utf8')) as DunstanRecord;
}

let emulated: Emulated;
let key: string;
let dir: string;

beforeAll(async () => {
  emulated = await emulators();
  dir = mkdtempSync(join(tmpdir(), 'dunstan-hosted-parity-'));
  const network = fakeNetwork();
  const deps = { checker: CHECKER, network: network.fetch, now: () => new Date() };
  await handle(await webhook('installation', installationPayload('created')), emulated.env, deps);
  key = await issueKey(emulated.env.DB);
});
afterAll(async () => {
  await emulated.mf.dispose();
});

describe('hosted parity with dunstan check', () => {
  it('has fixtures to compare', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    it(`${c.set}/${c.name}: same claims, verdict and digests`, async () => {
      const network = fakeNetwork();
      const response = await handle(
        checkRequest(key, {
          repository: FIXTURE_REPOSITORY,
          pullRequest: c.evidence.pullRequest.number,
          report: c.report.toString('utf8'),
        }),
        emulated.env,
        {
          checker: CHECKER,
          network: network.fetch,
          now: () => new Date(),
          readers: () => stubbedReaders(c),
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        verdict: string;
        record: string;
        signature: string;
      };
      const hosted = JSON.parse(body.record) as DunstanRecord;
      const local = await viaCli(c, dir);

      expect(determinismLine(c, hosted)).toBe(determinismLine(c, local));
      expect(determinismLine(c, hosted)).toBe(determinismLine(c, runCase(c)));
      expect(body.verdict).toBe(local.predicate.verdict);
      expect(verifyRecord(hosted).problems).toEqual([]);
      expect((await verifySsh(utf8.encode(body.record), body.signature, 'dunstan-record')).ok).toBe(
        true,
      );
      // The hosted path reached GitHub only for its installation token.
      expect(network.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
        'POST /app/installations/1/access_tokens',
      ]);
    });
  }
});
