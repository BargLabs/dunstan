// The retention sweep and installation state, in process against Miniflare's D1 and R2: no failure
// in one pass stops the others.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/app.js';
import { sweep } from '../src/store.js';
import {
  type Emulated,
  emulators,
  fakeNetwork,
  INSTALLATION,
  installationPayload,
  issueKey,
  webhook,
} from './support.js';

const CHECKER = { name: 'dunstan', version: '0.1.0', digest: { sha256: 'f'.repeat(64) } };
const DAY = 86_400_000;

let emulated: Emulated;
const deps = () => ({ checker: CHECKER, network: fakeNetwork().fetch, now: () => new Date() });

async function keys(): Promise<string[]> {
  return (await emulated.env.RECORDS.list({ prefix: 'records/' })).objects.map((o) => o.key).sort();
}

beforeAll(async () => {
  emulated = await emulators();
});
afterAll(async () => {
  await emulated.mf.dispose();
});
beforeEach(async () => {
  const { DB, RECORDS } = emulated.env;
  await DB.prepare('DELETE FROM api_keys').run();
  await DB.prepare('DELETE FROM installations').run();
  const listed = await RECORDS.list({ prefix: 'records/' });
  if (listed.objects.length > 0) await RECORDS.delete(listed.objects.map((o) => o.key));
  for (const id of [INSTALLATION, 2]) {
    await handle(
      await webhook('installation', installationPayload('created', id)),
      emulated.env,
      deps(),
    );
    await issueKey(DB, id);
    await RECORDS.put(`records/${id}/${'a'.repeat(64)}.json`, '{}');
  }
});

describe('the sweep', () => {
  it('enforces retention for everyone even when GitHub cannot be asked', async () => {
    const report = await sweep(emulated.env, new Date(Date.now() + 91 * DAY), async () => {
      throw new Error('GitHub timed out');
    });
    expect(await keys()).toEqual([]);
    expect(report.uninstalled).toEqual([]);
    expect(report.expired).toBe(2);
  });

  it('keeps records within retention, and uninstalls only what GitHub says is gone', async () => {
    const report = await sweep(emulated.env, new Date(), async (id) => (id === 2 ? false : null));
    expect(report.uninstalled).toEqual([2]);
    expect(await keys()).toEqual([`records/${INSTALLATION}/${'a'.repeat(64)}.json`]);
    const left = await emulated.env.DB.prepare('SELECT installation_id FROM api_keys').all();
    expect(left.results).toEqual([{ installation_id: INSTALLATION }]);
  });

  it('finishes an interrupted uninstall and deletes records no installation owns', async () => {
    await emulated.env.DB.prepare('UPDATE installations SET deleting = 1 WHERE id = 2').run();
    await emulated.env.RECORDS.put(`records/77/${'b'.repeat(64)}.json`, '{}');
    const report = await sweep(emulated.env, new Date(), async () => true);
    expect(report.uninstalled).toEqual([2]);
    expect(await keys()).toEqual([`records/${INSTALLATION}/${'a'.repeat(64)}.json`]);
  });
});

describe('installation events', () => {
  it('follows a renamed account (installation_target.renamed)', async () => {
    const response = await handle(
      await webhook('installation_target', {
        action: 'renamed',
        account: { login: 'renamed-org' },
        changes: { login: { from: 'example-org' } },
        installation: { id: INSTALLATION },
        target_type: 'Organization',
      }),
      emulated.env,
      deps(),
    );
    expect(response.status).toBe(202);
    const row = await emulated.env.DB.prepare('SELECT account FROM installations WHERE id = ?')
      .bind(INSTALLATION)
      .first();
    expect(row).toEqual({ account: 'renamed-org' });
  });

  it('acknowledges and ignores other events', async () => {
    const response = await handle(
      await webhook('push', { ref: 'refs/heads/main' }),
      emulated.env,
      deps(),
    );
    expect(response.status).toBe(202);
  });
});
