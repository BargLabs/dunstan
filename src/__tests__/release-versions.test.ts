// The distribution files agree with each other and with the rules they are published under: the npm
// package (package.json), the Claude Code plugin (plugins/dunstan/), its marketplace
// (.claude-plugin/marketplace.json) and the MCP registry entry (server.json). The release workflow
// publishes all of them from one version, so a version that disagrees anywhere fails here first.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { CHECKER_VERSION } from '../record/checker.js';

// ajv-formats is CommonJS; under NodeNext its default import is the module object (src/spec/schema.ts).
const addFormats = ajvFormats.default;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PLUGIN = join(ROOT, 'plugins/dunstan');

// biome-ignore lint/suspicious/noExplicitAny: parsed JSON whose shape each test asserts
const read = (path: string): any => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const pkg = read('package.json');
const plugin = read('plugins/dunstan/.claude-plugin/plugin.json');
const mcp = read('plugins/dunstan/.mcp.json');
const server = read('server.json');
const marketplace = read('.claude-plugin/marketplace.json');

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('one version everywhere', () => {
  // The prose pins the launcher too; a version bump that leaves one behind would tell users to run a
  // release that does not match the plugin.
  it.each([
    'README.md',
    'docs/mcp.md',
    'plugins/dunstan/README.md',
    'plugins/dunstan/skills/dunstan-check/SKILL.md',
  ])('%s pins dunstan@ at that version, and nowhere else', (file) => {
    const pins = [...readFileSync(join(ROOT, file), 'utf8').matchAll(/dunstan@(\d+\.\d+\.\d+)/g)];
    expect(pins.length).toBeGreaterThan(0);
    expect(new Set(pins.map((m) => m[1]))).toEqual(new Set([pkg.version]));
  });

  it('package.json, the checker, plugin.json, .mcp.json and server.json name the same version', () => {
    const version = pkg.version;
    expect(CHECKER_VERSION).toBe(version);
    expect(plugin.version).toBe(version);
    expect(mcp.mcpServers.dunstan.args).toEqual(['-y', `dunstan@${version}`, 'mcp']);
    expect(server.version).toBe(version);
    expect(server.packages.map((p: { version: string }) => p.version)).toEqual([version]);
  });
});

describe('the npm package', () => {
  it('is public, ships only the bundle and its notices, and needs no dependencies', () => {
    expect(pkg.name).toBe('dunstan');
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig).toEqual({ access: 'public', provenance: true });
    expect(pkg.files).toEqual([
      'dist/dunstan.mjs',
      'LICENSE',
      'NOTICE',
      'THIRD_PARTY_NOTICES',
      'spec/LICENSE',
      'README.md',
    ]);
    expect(pkg.bin).toEqual({ dunstan: 'dist/dunstan.mjs' });
    // dist/dunstan.mjs is bundled whole, so `npx -y dunstan@<version> mcp` installs nothing else.
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.mcpName).toBe(server.name);
  });

  it('carries the notices its bundled code requires', () => {
    const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES'), 'utf8');
    // The bundle inlines the MCP SDK, Ajv and Zod at least; each must have its licence text here.
    for (const id of ['@modelcontextprotocol/sdk@', 'ajv@', 'zod@']) expect(notices).toContain(id);
    expect(readFileSync(join(ROOT, 'NOTICE'), 'utf8')).toContain('THIRD_PARTY_NOTICES');
  });
});

describe('the MCP registry entry', () => {
  it('validates against the registry schema it names (vendored at test/mcp-registry/)', () => {
    expect(server.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    );
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(read('test/mcp-registry/server.schema-2025-12-11.json'));
    expect(validate(server), JSON.stringify(validate.errors)).toBe(true);
  });

  it('names the npm package over stdio, with GITHUB_TOKEN optional, secret and read-only', () => {
    expect(server.name).toBe('io.github.BargLabs/dunstan');
    expect(server.title).toBe('Dunstan');
    expect(server.websiteUrl).toBe('https://barglabs.ai/dunstan');
    expect(server.packages).toEqual([
      expect.objectContaining({
        registryType: 'npm',
        identifier: 'dunstan',
        transport: { type: 'stdio' },
        packageArguments: [{ type: 'positional', value: 'mcp' }],
      }),
    ]);
    const [token] = server.packages[0].environmentVariables;
    expect(token).toMatchObject({ name: 'GITHUB_TOKEN', isRequired: false, isSecret: true });
    expect(token.description).toMatch(/read-only/);
  });
});

describe('the plugin', () => {
  it('passes the GitHub token only from its own sensitive, optional userConfig entry', () => {
    expect(plugin.userConfig.github_token).toMatchObject({
      type: 'string',
      sensitive: true,
      required: false,
    });
    expect(plugin.userConfig.github_token.description).toMatch(/fine-grained/);
    expect(plugin.userConfig.github_token.description).toMatch(/read-only/);
    expect(mcp.mcpServers.dunstan).toEqual({
      command: 'npx',
      args: ['-y', `dunstan@${pkg.version}`, 'mcp'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Claude Code's user_config placeholder, literal
      env: { GITHUB_TOKEN: '${user_config.github_token}' },
    });
  });

  it("teaches a block the schema accepts: the skill's example, its placeholders filled", () => {
    const skill = readFileSync(join(PLUGIN, 'skills/dunstan-check/SKILL.md'), 'utf8');
    const example = /```json\n([\s\S]*?)\n```/.exec(skill)?.[1];
    expect(example).toBeDefined();
    const block = JSON.parse(example as string);
    block.headCommit = 'a'.repeat(40);
    block.references[2].commit = 'b'.repeat(40);
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(read('spec/schema/handback-block-0.1.schema.json'));
    expect(validate(block), JSON.stringify(validate.errors)).toBe(true);
  });

  it('is listed by the marketplace at its own folder', () => {
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: plugin.name, source: './plugins/dunstan' }),
    ]);
  });

  it("keeps within the directory's file limits: 512 files, none of 256 KiB or more", () => {
    const files = filesUnder(PLUGIN);
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(512);
    const large = files.filter((f) => statSync(f).size >= 256 * 1024).map((f) => relative(ROOT, f));
    expect(large).toEqual([]);
  });
});

// The first publish (dunstan@0.1.6) was served about 95 seconds after npm accepted it, past the
// workflow's 60-second wait, so the registry step never ran and a re-run would have refused the
// version npm now held. The release must wait long enough and be safe to re-run.
describe('the release workflow', () => {
  const release = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');

  it('waits up to 15 minutes for npm to serve this exact package', () => {
    const loop =
      /for i in \$\(seq 1 (\d+)\); do\n\s+served=\$\(npm view "dunstan@\$VERSION" dist\.integrity/.exec(
        release,
      );
    expect(loop).not.toBeNull();
    expect(Number(loop?.[1]) * 10).toBeGreaterThanOrEqual(900);
    expect(release).toContain('if [ "$served" = "$INTEGRITY" ]');
  });

  it('skips a publish already done with the same tarball, and refuses a different one', () => {
    expect(release).toMatch(
      /- name: Publish to npm with provenance\n\s+if: env\.NPM_PUBLISHED != '1'/,
    );
    expect(release).toContain('test "$published" = "$local_integrity"');
    expect(release).toMatch(/versions\/\$VERSION"\n[\s\S]*already in the MCP registry/);
  });
});

// No example hands the server a credential the user's machine already holds: the checklist holds a
// plugin that does, even in a README.
describe('no example passes on an ambient credential', () => {
  // Every tracked Markdown file, and every file of the plugin.
  const docs = [
    ...new Set([
      ...execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: ROOT, encoding: 'utf8' })
        .split('\0')
        .filter(Boolean),
      ...filesUnder(PLUGIN).map((f) => relative(ROOT, f)),
    ]),
  ].sort();
  expect(docs.length).toBeGreaterThan(10);

  it.each(docs)('%s', (file) => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    expect(text).not.toMatch(/\$\(\s*gh auth token\s*\)/);
    expect(text).not.toMatch(/\$\{?GITHUB_TOKEN\}?/);
  });
});
