// Real check-run and job ids are longer than ten digits: GitLab job ids are 11 digits (the first
// run of the Dunstan GitLab component passed CI_JOB_ID 17921351676) and GitHub check-run ids 12
// (130263525947). The CLI takes any positive integer up to Number.MAX_SAFE_INTEGER, the bound a
// record's JSON integer can hold exactly, and refuses anything else rather than rounding it.
import { describe, expect, it } from 'vitest';
import { parseCheckRunIds, parsePositiveInt } from './check.js';

describe('parsePositiveInt', () => {
  it.each([
    ['1', 1],
    ['17921351676', 17921351676],
    ['130263525947', 130263525947],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('accepts %s', (value, expected) => {
    expect(parsePositiveInt(value, '--exclude-gitlab-job')).toBe(expected);
  });

  it.each([
    '9007199254740992',
    '99999999999999999999',
    '0',
    '-1',
    '01',
    '1e3',
    '1.0',
    ' 1',
    '',
    'x',
  ])('refuses %j and names the flag and the bound', (value) => {
    expect(() => parsePositiveInt(value, '--exclude-gitlab-job')).toThrow(
      /--exclude-gitlab-job must be a positive integer of at most 9007199254740991/,
    );
  });
});

describe('parseCheckRunIds', () => {
  it('accepts a 12-digit GitHub check-run id', () => {
    expect(parseCheckRunIds(['130263525947', '17921351676'])).toEqual([130263525947, 17921351676]);
  });

  it('refuses an id past the safe-integer range, naming --exclude-check-run', () => {
    expect(() => parseCheckRunIds(['9007199254740992'])).toThrow(/--exclude-check-run/);
  });
});
