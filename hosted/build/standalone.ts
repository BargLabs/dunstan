// Ajv's standalone output for the two published schemas, compiled with the checker's own Ajv
// configuration (src/spec/schema.ts, createAjv). The hosted build puts this module's text in place of
// src/spec/schema-validators.ts, so the Worker validates with the code Ajv would otherwise generate at
// run time with `new Function`, which Workers refuse.

import { _ } from 'ajv/dist/2020.js';
import standaloneModule from 'ajv/dist/standalone/index.js';
import {
  BLOCK_SCHEMA_FILE,
  createAjv,
  RECORD_SCHEMA_FILE,
  schemaId,
} from '../../src/spec/schema.js';

// The standalone module is CommonJS; under NodeNext its default import is the module object.
const standaloneCode = standaloneModule.default;

export function standaloneValidators(): string {
  const ajv = createAjv({
    code: {
      source: true,
      esm: true,
      formats: _`require("ajv-formats/dist/formats").fullFormats`,
    },
  });
  const code = standaloneCode(ajv, {
    block: schemaId(BLOCK_SCHEMA_FILE),
    record: schemaId(RECORD_SCHEMA_FILE),
  });
  return `${code}\nexport const PRECOMPILED = { block, record };\n`;
}
