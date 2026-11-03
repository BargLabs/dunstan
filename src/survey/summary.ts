// The survey's Markdown summary (DRAFT, docs/survey.md), built from the survey record alone and
// deterministic: the same record gives the same bytes. Its first lines state the selection and
// whether GitHub was read with a token, and an anonymous survey says that its cannot-settle share is
// higher for it. Then, in order: the claims the record could not
// settle, with a remedy for each reason; the two rates; the claims by type; the advisory notes when
// the survey ran the advisory reader; the pull request counts. It reports settleability. Its words
// are "the record could not settle" and "contradicted by the record", never a judgment of the
// author.

import { noteText } from '../advisory/present.js';
import { remedyForReason } from '../remedy/remedies.js';
import type { Rate } from './aggregate.js';
import { CLAIM_TYPES, type Column } from './mapping.js';
import type { ListingEnd, SurveyRecord } from './record.js';

const COLUMN_LABEL: Record<Column, string> = {
  supported: 'Supported',
  unverifiable: 'Unverifiable',
  notRecordCheckable: 'Not record-checkable',
  contradicted: 'Contradicted',
};

const END_TEXT: Record<ListingEnd, string> = {
  selection_full: 'it held enough pull requests for the selection',
  since_reached: 'it reached pull requests created before the --since date',
  listing_ended: 'it ended',
  listing_unreadable: 'a page could not be read; the selection is from the pages read before it',
  page_bound: 'it reached the page bound',
};

// The sentence an anonymous survey's summary carries after its reader.
export const ANONYMOUS =
  'Without a token, every tests claim naming a JUnit record and every `closes` claim cannot be settled, so the cannot-settle share is higher than an authenticated read of the same repository would give.';

function row(cells: readonly (string | number)[]): string {
  return `| ${cells.join(' | ')} |`;
}

function table(head: readonly string[], rows: readonly (readonly (string | number)[])[]): string[] {
  return [row(head), row(head.map(() => '---')), ...rows.map(row)];
}

function share(r: Rate): string {
  return r.value ?? 'n/a';
}

function interval(r: Rate): string {
  return r.wilson95 === null ? 'n/a' : `${r.wilson95.low}–${r.wilson95.high}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function renderSurveySummary(record: SurveyRecord): string {
  const { parameters, listing, selected } = record.selection;
  const a = record.aggregate;
  const lines: string[] = [];

  const scope = [`the ${parameters.last} most recently created closed pull requests`];
  if (parameters.since !== null) scope.push(`created on or after ${parameters.since}`);
  if (parameters.authors.length > 0) scope.push(`opened by ${parameters.authors.join(', ')}`);
  const report =
    parameters.report.kind === 'pr-body'
      ? 'the pull request body'
      : `the latest comment by ${parameters.report.author}`;
  lines.push(
    `# Settleability survey: ${parameters.repository}`,
    '',
    `DRAFT (${record.format}). ${record.checker.name} ${record.checker.version}, survey mapping ${a.mapping.version}. Read-only.`,
    '',
    `Selection: ${scope.join(', ')}. Report: ${report}. Advisory reader: ${parameters.advisory ? 'on' : 'off'}.`,
    '',
    record.selection.reader.authenticated
      ? 'GitHub was read with a token (GITHUB_TOKEN set).'
      : `GitHub was read without a token (GITHUB_TOKEN not set). ${ANONYMOUS}`,
    '',
    'This survey reports which claims the record could settle. A claim the record could not settle is neither supported nor contradicted.',
    '',
    '## Claims the record could not settle',
    '',
    `The record could not settle ${a.cannotSettle.numerator} of ${plural(a.cannotSettle.denominator, 'claim', 'claims')}.`,
    '',
  );
  if (a.unsettled.length === 0) {
    lines.push('None.');
  } else {
    lines.push(
      ...table(
        ['Reason', 'Column', 'Claims', 'Remedy'],
        a.unsettled.map((u) => [
          `\`${u.reason}\``,
          COLUMN_LABEL[u.column],
          u.count,
          u.remedy ?? 'none listed',
        ]),
      ),
    );
  }

  lines.push(
    '',
    '## Results',
    '',
    ...table(
      ['Measure', 'Claims', 'Of', 'Share', 'Wilson 95%'],
      [
        [
          'The record could not settle',
          a.cannotSettle.numerator,
          `${a.cannotSettle.denominator} claims`,
          share(a.cannotSettle),
          interval(a.cannotSettle),
        ],
        [
          'Contradicted by the record, of the claims it settled',
          a.contradictedOfSettled.numerator,
          `${a.contradictedOfSettled.denominator} settled claims`,
          share(a.contradictedOfSettled),
          interval(a.contradictedOfSettled),
        ],
      ],
    ),
    '',
    '## By claim type',
    '',
    ...table(
      ['Type', 'Supported', 'Unverifiable', 'Not record-checkable', 'Contradicted'],
      [
        ...a.byType.map((t) => {
          const label = CLAIM_TYPES.find((c) => c.type === t.type)?.label ?? '';
          return [
            `${t.type} ${label}`,
            t.supported,
            t.unverifiable,
            t.notRecordCheckable,
            t.contradicted,
          ];
        }),
        [
          `All (${a.claims.total})`,
          a.claims.supported,
          a.claims.unverifiable,
          a.claims.notRecordCheckable,
          a.claims.contradicted,
        ],
      ],
    ),
  );

  if (a.advisory !== undefined) {
    lines.push(
      '',
      '## Advisory notes',
      '',
      `The advisory reader read the prose of ${plural(a.advisory.pullRequests, 'pull request', 'pull requests')}. Its notes never enter either rate, and a possible disagreement is unverified.`,
      '',
    );
    if (a.advisory.notes.length === 0) lines.push('No notes.');
    else {
      lines.push(
        ...table(
          ['Note', 'As shown', 'Count'],
          a.advisory.notes.map((n) => [`\`${n.note}\``, noteText(n.note), n.count]),
        ),
      );
    }
  }

  const p = a.pullRequests;
  const context = { hasToken: record.selection.reader.authenticated };
  const remedy = (reason: string) => remedyForReason(reason, context) ?? '';
  lines.push(
    '',
    '## Pull requests',
    '',
    ...table(
      ['Pull requests', 'Count', 'Remedy'],
      [
        ['Listed', p.listed, ''],
        ['Selected', p.selected, ''],
        ['With a valid block', p.blockFound, ''],
        ['`block_missing`', p.blockMissing, remedy('block_missing')],
        ['`block_invalid`', p.blockInvalid, remedy('block_invalid')],
        ['`block_ambiguous`', p.blockAmbiguous, remedy('block_ambiguous')],
        ...p.noRecord.map((n) => [`No record: \`${n.reason}\``, n.count, remedy(n.reason)]),
      ],
    ),
    '',
    `The listing was read for ${plural(listing.pages.length, 'page', 'pages')} and no further because ${listing.end === 'page_bound' ? `it reached the bound of ${listing.pageBound} pages` : END_TEXT[listing.end]}.`,
  );
  if (listing.duplicates > 0) {
    const one = listing.duplicates === 1;
    lines.push(
      '',
      `The listing named ${plural(listing.duplicates, 'pull request', 'pull requests')} again on a later page, so it changed while it was read: most likely ${plural(listing.duplicates, 'pull request', 'pull requests')} closed meanwhile and ${one ? 'was' : 'were'} not listed, and the selection may be missing ${one ? 'it' : 'them'}. Each repeated pull request is listed, selected and counted once: the pages held ${listing.pullRequests.length + listing.duplicates} items for ${listing.pullRequests.length} pull requests.`,
    );
  }
  if (selected.length < parameters.last) {
    lines.push(
      '',
      `${plural(selected.length, 'pull request was', 'pull requests were')} selected, fewer than the ${parameters.last} asked for.`,
    );
  }
  lines.push(
    '',
    `Verify offline: \`${record.rerun.offline}\`. Run again: \`${record.rerun.online}\`.`,
    '',
  );
  return lines.join('\n');
}
