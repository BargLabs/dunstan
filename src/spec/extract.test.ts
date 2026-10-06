import { describe, expect, it } from 'vitest';
import { extractHandbackBlock } from './extract.js';
import { overallVerdict } from './record.js';

const BLOCK =
  '{"dunstan":"0.1","headCommit":"c0ffee12345678abcdef0123456789abcdef0123","filesChanged":["a.ts"]}';

function report(...lines: string[]): string {
  return lines.join('\n');
}

describe('extractHandbackBlock', () => {
  it('finds a block fenced with backticks or tildes', () => {
    expect(extractHandbackBlock(report('```dunstan-handback', BLOCK, '```')).status).toBe('found');
    expect(extractHandbackBlock(report('~~~dunstan-handback', BLOCK, '~~~')).status).toBe('found');
  });

  it('accepts CRLF and lone CR line endings and a leading byte order mark', () => {
    expect(extractHandbackBlock(`﻿\`\`\`dunstan-handback\r\n${BLOCK}\r\n\`\`\`\r\n`).status).toBe(
      'found',
    );
    expect(extractHandbackBlock(`\`\`\`dunstan-handback\r${BLOCK}\r\`\`\``).status).toBe('found');
  });

  it('trims spaces around the info string but otherwise matches it exactly', () => {
    expect(extractHandbackBlock(report('```  dunstan-handback  ', BLOCK, '```')).status).toBe(
      'found',
    );
    for (const info of ['Dunstan-Handback', 'dunstan-handback json', 'dunstan-handback-v2']) {
      expect(extractHandbackBlock(report(`\`\`\`${info}`, BLOCK, '```')).status).toBe('missing');
    }
  });

  it('allows up to three spaces of indentation; four is an indented code block', () => {
    expect(extractHandbackBlock(report('   ```dunstan-handback', BLOCK, '   ```')).status).toBe(
      'found',
    );
    expect(extractHandbackBlock(report('    ```dunstan-handback', BLOCK, '    ```')).status).toBe(
      'missing',
    );
  });

  it('closes only on a fence of the same character at least as long', () => {
    const result = extractHandbackBlock(
      report('````dunstan-handback', BLOCK, '```', '~~~~', '````'),
    );
    // The inner ``` and ~~~~ lines are content, so the JSON is followed by junk.
    expect(result).toMatchObject({ status: 'invalid', errors: [{ code: 'invalid_json' }] });
    expect(extractHandbackBlock(report('````dunstan-handback', BLOCK, '`````')).status).toBe(
      'found',
    );
  });

  it('does not close on a fence line with trailing text', () => {
    expect(extractHandbackBlock(report('```dunstan-handback', BLOCK, '``` done')).status).toBe(
      'invalid',
    );
  });

  it('ignores blocks inside other fences, including other tilde fences', () => {
    const text = report('~~~', '```dunstan-handback', BLOCK, '```', '~~~');
    expect(extractHandbackBlock(text).status).toBe('missing');
  });

  it('counts an unterminated handback fence, so a second one makes the report ambiguous', () => {
    const text = report('```dunstan-handback', BLOCK, '```', '```dunstan-handback', BLOCK);
    expect(extractHandbackBlock(text)).toEqual({ status: 'ambiguous', count: 2 });
  });

  it('a backtick fence whose info string holds a backtick is not a fence', () => {
    expect(extractHandbackBlock(report('```dunstan-handback`', BLOCK, '```')).status).toBe(
      'missing',
    );
  });

  it('refuses a block for a major version this module does not implement', () => {
    const block = BLOCK.replace('"0.1"', '"2.3"');
    expect(extractHandbackBlock(report('```dunstan-handback', block, '```'))).toMatchObject({
      status: 'invalid',
      errors: [{ code: 'unsupported_version', pointer: '/dunstan' }],
    });
  });

  it('digests the canonical block, so formatting does not change it', () => {
    const pretty = JSON.stringify(JSON.parse(BLOCK), null, 4);
    const a = extractHandbackBlock(report('```dunstan-handback', BLOCK, '```'));
    const b = extractHandbackBlock(report('~~~~ dunstan-handback', pretty, '~~~~'));
    expect(a.status === 'found' && b.status === 'found' && a.sha256 === b.sha256).toBe(true);
  });
});

describe('overallVerdict', () => {
  const pass = { verdict: 'pass' } as const;
  const fail = { verdict: 'fail' } as const;
  const unverifiable = { verdict: 'unverifiable' } as const;

  it('fails if any row fails, even beside unverifiable rows', () => {
    expect(overallVerdict('found', [pass, unverifiable, fail])).toBe('fail');
  });

  it('is unverifiable for any unverifiable row, zero rows, or a block not found', () => {
    expect(overallVerdict('found', [pass, unverifiable])).toBe('unverifiable');
    expect(overallVerdict('found', [])).toBe('unverifiable');
    expect(overallVerdict('missing', [])).toBe('unverifiable');
    expect(overallVerdict('ambiguous', [])).toBe('unverifiable');
    expect(overallVerdict('invalid', [])).toBe('unverifiable');
  });

  it('passes only when every row passes', () => {
    expect(overallVerdict('found', [pass, pass])).toBe('pass');
  });
});
