// Planted violation: a module loaded by a computed name, which no import graph can see.
export function load(name: string): Promise<unknown> {
  return import(name);
}
