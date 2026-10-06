// The GitHub App as docs/hosted.md states it ("Contents: read"): read-only permissions, exactly
// these, no event subscriptions; every installation token asks for the same set; and the Contents:
// read caveat is stated on the install page and in docs/hosted.md.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestFor, manifestForm } from '../scripts/manifest-form.js';
import { READ_PERMISSIONS } from '../src/github-app.js';
import { ROOT } from './support.js';

const manifest = JSON.parse(readFileSync(join(ROOT, 'hosted/github-app-manifest.json'), 'utf8'));

describe('the GitHub App manifest', () => {
  it('asks for exactly the ruled permissions, each read-only', () => {
    expect(manifest.default_permissions).toEqual({
      actions: 'read',
      checks: 'read',
      contents: 'read',
      deployments: 'read',
      issues: 'read',
      metadata: 'read',
      pull_requests: 'read',
    });
    expect(Object.values(manifest.default_permissions).every((v) => v === 'read')).toBe(true);
  });

  it('asks every installation token for the same read-only set', () => {
    expect(READ_PERMISSIONS).toEqual(manifest.default_permissions);
  });

  it('subscribes to no events (installation events are always delivered to an App)', () => {
    expect(manifest.default_events).toEqual([]);
  });

  it('states the Contents: read caveat on the install page', () => {
    expect(manifest.description).toMatch(/Contents: read/);
    expect(manifest.description).toMatch(/never requests file contents/);
    expect(manifest.description).toMatch(/Barg Labs Ltd/);
  });

  it('states the caveat and names the controller in docs/hosted.md', () => {
    const doc = readFileSync(join(ROOT, 'docs/hosted.md'), 'utf8');
    expect(doc).toMatch(/Contents: read/);
    expect(doc).toMatch(/Barg Labs Ltd/);
  });

  it('builds the creation form only with a real origin in place of the placeholder', () => {
    const form = manifestForm('https://dunstan.example.com', 'example-org', 'state1');
    expect(form).toContain(
      'https://github.com/organizations/example-org/settings/apps/new?state=state1',
    );
    expect(form).toContain('https://dunstan.example.com/v0.1/webhooks/github');
    expect(form).not.toContain('HOSTED_ORIGIN');
    expect(JSON.parse(manifestFor('https://dunstan.example.com')).hook_attributes.url).toBe(
      'https://dunstan.example.com/v0.1/webhooks/github',
    );
    expect(() => manifestFor('http://dunstan.example.com')).toThrow();
    expect(() => manifestFor('https://dunstan.example.com/path')).toThrow();
  });
});
