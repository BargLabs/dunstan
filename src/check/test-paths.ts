// Test paths (DRAFT 0.2.0, spec D.14): the file patterns a consumer accepts as its test files, given
// to the checker (`--test-paths`, the Action's `test-paths`, the MCP tool's `testPaths`), never
// read from the repository. They are recorded as evidence, so the context they give, which
// changed files are tests, is worked out again from any record. They decide no claim.
//
// A pattern is matched against a changed file's path. One with no `/` matches the last segment, in
// any directory (`*_test.go`); one with a `/` matches the whole path from the root
// (`src/**/*.test.ts`). `**` matches any number of segments, none included; `*` any characters but
// `/`; `?` one character but `/`; `{a,b}` either alternative (not nested). Nothing else is special.

export const MAX_TEST_PATHS = 50;
export const MAX_PATTERN_LENGTH = 200;

// Why a pattern is refused, or undefined when it is one.
export function testPathProblem(pattern: string): string | undefined {
  if (pattern.trim() !== pattern || pattern === '') return 'is empty or has spaces around it';
  if (pattern.length > MAX_PATTERN_LENGTH) return `is longer than ${MAX_PATTERN_LENGTH}`;
  if (pattern.startsWith('/') || pattern.startsWith('!')) return 'starts with / or !';
  if (pattern.split('/').some((s) => s === '..' || s === '.')) return 'has a . or .. segment';
  if (/[\\[\]]/.test(pattern)) return 'uses \\, [ or ], which test paths do not';
  if (
    /\{[^}]*\{/.test(pattern) ||
    (pattern.match(/\{/g)?.length ?? 0) !== (pattern.match(/\}/g)?.length ?? 0)
  ) {
    return 'has unbalanced or nested { }';
  }
  return undefined;
}

// The patterns, or an error naming the first refused one: at most MAX_TEST_PATHS, each once.
export function parseTestPaths(patterns: readonly string[]): string[] {
  if (patterns.length > MAX_TEST_PATHS) {
    throw new Error(`at most ${MAX_TEST_PATHS} test paths, not ${patterns.length}`);
  }
  for (const p of patterns) {
    const problem = testPathProblem(p);
    if (problem !== undefined) throw new Error(`test path "${p}" ${problem}`);
  }
  return [...new Set(patterns)];
}

function segmentRegex(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      out += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map(segmentRegex)
        .join('|')})`;
      i = end;
    } else out += c.replace(/[.^$+()|]/g, '\\$&');
  }
  return out;
}

function regexOf(pattern: string): RegExp {
  const parts = pattern.split('/');
  const body = parts
    .map((part, i) => {
      if (part !== '**') return `${segmentRegex(part)}${i < parts.length - 1 ? '/' : ''}`;
      return i < parts.length - 1 ? '(?:[^/]+/)*' : '.*';
    })
    .join('');
  return new RegExp(`^${body}$`);
}

export function matchesTestPath(pattern: string, path: string): boolean {
  if (!pattern.includes('/')) return regexOf(pattern).test(path.split('/').at(-1) ?? path);
  return regexOf(pattern).test(path);
}

export function isTestPath(patterns: readonly string[], path: string): boolean {
  return patterns.some((p) => matchesTestPath(p, path));
}
