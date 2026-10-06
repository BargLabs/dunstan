// Precompiled schema validators, for a runtime that refuses to compile code from strings. In source,
// and in the CLI and Action bundles, there are none: src/spec/schema.ts compiles the published schemas
// with Ajv at first use. The hosted Worker build (scripts/build-hosted.mjs) replaces this one module
// with Ajv's standalone output for the same schema files and the same options (createAjv), because
// Cloudflare Workers refuse `new Function`. hosted/test/validators.test.ts checks that the two give
// the same answers.

import type { SchemaValidators } from './schema.js';

export const PRECOMPILED: SchemaValidators | undefined = undefined;
