// Planted violation: a free reference to the global fetch.
export function leak(url: string): Promise<Response> {
  return fetch(url);
}
