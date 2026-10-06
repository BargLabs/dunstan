// Planted violation: a subprocess outside src/record/sign.ts (curl would do).
import { execFileSync } from 'node:child_process';

export const run = execFileSync;
