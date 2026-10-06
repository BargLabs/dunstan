// Not a violation: local bindings and property names that only resemble network primitives, and the
// word fetch in a comment and a string.
const fetch = (n: number) => n + 1;
const client = { fetch: 'fetch is just a word here' };

export const local = fetch(1);
export const property = client.fetch;
