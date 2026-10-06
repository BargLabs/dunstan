// Planted violation: a CommonJS loader, which can load node:https by a computed name.
import { createRequire } from 'node:module';

export const load = createRequire(import.meta.url);
