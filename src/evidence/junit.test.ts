import { describe, expect, it } from 'vitest';
import { junitXml, makeZip } from '../__tests__/fake-github.js';
import { countJunit, JunitError } from './junit.js';
import { readZipEntry, ZipError } from './zip.js';

describe('countJunit', () => {
  it('counts executed and failed test cases, never suite attributes', () => {
    expect(countJunit(junitXml(['pass', 'fail', 'error', 'skip', 'pass']))).toEqual({
      executed: 4,
      failed: 2,
    });
  });

  it('counts a skipped test case that also failed as not executed', () => {
    const xml = '<testsuite><testcase name="a"><skipped/><failure/></testcase></testsuite>';
    expect(countJunit(xml)).toEqual({ executed: 0, failed: 0 });
  });

  it('counts a test case with a failure and an error once', () => {
    const xml = '<testsuite><testcase name="a"><failure/><error/></testcase></testsuite>';
    expect(countJunit(xml)).toEqual({ executed: 1, failed: 1 });
  });

  it('reads only direct children of a test case', () => {
    const xml =
      '<testsuite><testcase name="a"><system-out><failure/></system-out></testcase></testsuite>';
    expect(countJunit(xml)).toEqual({ executed: 1, failed: 0 });
  });

  it('accepts comments, CDATA, entities, attributes in either quote and a BOM', () => {
    const xml = `﻿<?xml version="1.0"?>\n<!-- run --><testsuites name='a &amp; b'><testsuite><testcase name="x &lt; y"><system-out><![CDATA[<not a tag>]]></system-out></testcase></testsuite></testsuites>`;
    expect(countJunit(xml)).toEqual({ executed: 1, failed: 0 });
  });

  it.each([
    ['unbalanced tags', '<testsuite><testcase></testsuite>'],
    ['two roots', '<testsuite/><testsuite/>'],
    ['a root that is not a suite', '<html><testcase/></html>'],
    ['a DOCTYPE (no entity expansion)', '<!DOCTYPE x [<!ENTITY a "b">]><testsuite/>'],
    ['an unknown entity', '<testsuite name="&bogus;"/>'],
    ['an unquoted attribute', '<testsuite name=a/>'],
    ['a duplicate attribute', '<testsuite a="1" a="2"/>'],
    ['text outside the root', 'hello<testsuite/>'],
    ['an empty file', ''],
    ['an unclosed root', '<testsuite>'],
  ])('refuses %s', (_, xml) => {
    expect(() => countJunit(xml)).toThrow(JunitError);
  });
});

describe('readZipEntry', () => {
  const zip = makeZip({ 'a.txt': 'alpha', 'reports/junit.xml': junitXml(['pass']) });

  it('reads a deflated entry by its exact path', () => {
    expect(new TextDecoder().decode(readZipEntry(zip, 'a.txt') ?? new Uint8Array())).toBe('alpha');
  });

  it('answers null for a path the archive does not hold', () => {
    expect(readZipEntry(zip, 'reports/JUNIT.xml')).toBeNull();
  });

  it('refuses bytes that are not an archive', () => {
    expect(() => readZipEntry(new TextEncoder().encode('not a zip file at all'), 'a')).toThrow(
      ZipError,
    );
  });
});
