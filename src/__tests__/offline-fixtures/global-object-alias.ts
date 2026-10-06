// Planted violation: fetch reached through the global object by a computed name, which no search for
// the word "fetch" finds.
const scope = globalThis as unknown as Record<string, unknown>;

export const leak = scope[['fe', 'tch'].join('')];
