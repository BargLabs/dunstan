// Writes the HTML page that creates the GitHub App from hosted/github-app-manifest.json (GitHub's
// manifest flow: the page posts the manifest to GitHub, the operator confirms, and GitHub redirects
// with a one-time code that `gh api -X POST /app-manifests/<code>/conversions` exchanges for the
// App's id, private key and webhook secret). Operator-run; docs/runbooks/hosted-provisioning.md.
//
// Usage (from the repository root):
//   node --experimental-strip-types hosted/scripts/manifest-form.ts \
//     --origin https://<worker host> --org <github organization> > app-manifest.html

import { randomBytes } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const PLACEHOLDER = 'https://HOSTED_ORIGIN';

export function manifestFor(origin: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('--origin must be an https origin, such as https://dunstan.example.com');
  }
  const text = readFileSync(new URL('../github-app-manifest.json', import.meta.url), 'utf8');
  const manifest = text.replaceAll(PLACEHOLDER, url.origin);
  if (manifest.includes('HOSTED_ORIGIN')) throw new Error('the manifest still names HOSTED_ORIGIN');
  return JSON.stringify(JSON.parse(manifest));
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function manifestForm(origin: string, org: string, state: string): string {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(org)) throw new Error('--org must be a login');
  const action = `https://github.com/organizations/${org}/settings/apps/new?state=${state}`;
  return `<!doctype html>
<meta charset="utf-8">
<title>Create the Dunstan GitHub App</title>
<form action="${escapeHtml(action)}" method="post">
  <input type="hidden" name="manifest" value="${escapeHtml(manifestFor(origin))}">
  <p>Creates the Dunstan GitHub App in ${escapeHtml(org)} with read-only permissions.</p>
  <button type="submit">Create the GitHub App</button>
</form>
`;
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      options: { origin: { type: 'string' }, org: { type: 'string' } },
    });
    if (values.origin === undefined || values.org === undefined) {
      throw new Error('--origin <https://host> and --org <organization> are required');
    }
    process.stdout.write(manifestForm(values.origin, values.org, randomBytes(16).toString('hex')));
  } catch (e) {
    process.stderr.write(`manifest-form: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
