// The record items of one pull request, from its evidence snapshot only, in record order: commits,
// timeline events, check runs, changed files, test cases. Record order is the first tie-break after
// score, so it is fixed here and nowhere else.

import { countedCheckRuns } from '../check/checks.js';
import type { Evidence, TestItem } from '../check/types.js';
import type { RecordItem } from './types.js';

export type ItemSnapshot = Pick<Evidence, 'files' | 'checkRuns' | 'items'>;

// A test case's identifier: classname.name, or the name alone when the case has no classname.
export function testId(test: TestItem): string {
  return test.classname === undefined ? test.name : `${test.classname}.${test.name}`;
}

export function recordItems(evidence: ItemSnapshot): RecordItem[] {
  const items: RecordItem[] = [];
  const sections = evidence.items;

  if (sections?.commits.status === 'ok') {
    for (const c of sections.commits.entries) {
      items.push({
        type: 'commit',
        id: c.sha,
        fields: [
          ['sha', c.sha],
          ['headline', c.headline],
        ],
      });
    }
  }
  if (sections?.timeline.status === 'ok') {
    for (const e of sections.timeline.entries) {
      const fields: [string, string][] = [['event', e.event]];
      if (e.ref !== undefined) fields.push(['ref', e.ref]);
      if (e.detail !== undefined) fields.push(['detail', e.detail]);
      items.push({ type: 'timeline_event', id: e.id, fields });
    }
  }
  if (evidence.checkRuns?.status === 'ok') {
    // The runs the 0.1 checks count: the latest per name, less any the checker excluded.
    for (const run of countedCheckRuns(evidence.checkRuns.runs, evidence.checkRuns.excludedIds)) {
      items.push({ type: 'check_run', id: String(run.id), fields: [['name', run.name]] });
    }
  }
  if (evidence.files?.status === 'ok') {
    for (const f of evidence.files.entries) {
      const fields: [string, string][] = [['path', f.path]];
      if (f.previousPath !== undefined) fields.push(['previousPath', f.previousPath]);
      items.push({ type: 'file', id: f.path, fields });
    }
  }
  if (sections?.tests.status === 'ok') {
    for (const t of sections.tests.entries) {
      const fields: [string, string][] = [['name', t.name]];
      if (t.classname !== undefined) fields.push(['classname', t.classname]);
      items.push({ type: 'test', id: testId(t), fields });
    }
  }
  return items;
}
