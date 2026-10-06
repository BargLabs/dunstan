// Validation against the published schema files in spec/schema/, read from disk, so the schema a
// third party downloads is the schema these tests exercise. There is no hand-written copy.

import { Ajv2020, type ErrorObject, type Options } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import { schemaText } from './schema-files.js';
import { PRECOMPILED } from './schema-validators.js';

// ajv-formats is CommonJS; under NodeNext its default import is the module object, whose `default`
// member is the plugin.
const addFormats = ajvFormats.default;

export const BLOCK_SCHEMA_FILE = 'handback-block-0.1.schema.json';
export const RECORD_SCHEMA_FILE = 'record-0.1.schema.json';
export const DRAFT_RECORD_SCHEMA_FILE = 'record-0.2-draft.schema.json';

export interface SchemaError {
  code: 'schema_violation';
  pointer: string;
  keyword: string;
  message: string;
}

export function readSchema(file: string): Record<string, unknown> {
  return JSON.parse(schemaText(file)) as Record<string, unknown>;
}

// A compiled validator: Ajv's, or the same code precompiled (src/spec/schema-validators.ts).
export interface Validator {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null | undefined;
}

export interface SchemaValidators {
  block: Validator;
  record: Validator;
}

export function schemaId(file: string): string {
  return readSchema(file).$id as string;
}

// The one Ajv configuration. `extra` adds code-generation options only (the hosted build's
// standalone output); it never changes what validates.
export function createAjv(extra: Pick<Options, 'code'> = {}): Ajv2020 {
  // strictSchema refuses unknown keywords, so a misspelled keyword in a published schema fails
  // here instead of being ignored. strictTypes and strictTuples are Ajv-only style rules (a
  // `type` beside every `properties`; a fixed tuple length), not JSON Schema, so they are off: the
  // record's subject is a one- or two-item tuple on purpose.
  const ajv = new Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictNumbers: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    ...extra,
  });
  addFormats(ajv);
  ajv.addSchema(readSchema(BLOCK_SCHEMA_FILE));
  ajv.addSchema(readSchema(RECORD_SCHEMA_FILE));
  return ajv;
}

export function compileValidators(): SchemaValidators {
  const ajv = createAjv();
  return {
    block: ajv.getSchema(schemaId(BLOCK_SCHEMA_FILE)) as Validator,
    record: ajv.getSchema(schemaId(RECORD_SCHEMA_FILE)) as Validator,
  };
}

let validators: SchemaValidators | undefined;

function load(): SchemaValidators {
  validators ??= PRECOMPILED ?? compileValidators();
  return validators;
}

function toSchemaErrors(errors: ErrorObject[] | null | undefined): SchemaError[] {
  return (errors ?? []).map((e) => ({
    code: 'schema_violation',
    pointer: e.instancePath,
    keyword: e.keyword,
    message: e.message ?? e.keyword,
  }));
}

export function validateBlock(value: unknown): SchemaError[] {
  const validate = load().block;
  return validate(value) ? [] : toSchemaErrors(validate.errors);
}

export function validateRecord(value: unknown): SchemaError[] {
  const validate = load().record;
  return validate(value) ? [] : toSchemaErrors(validate.errors);
}

// The DRAFT 0.2.0 record schema, which refers into the 0.1 one. It is compiled at first use and is
// not among the precompiled validators: the hosted Worker writes 0.1 records only.
let draftRecord: Validator | undefined;

export function validateDraftRecord(value: unknown): SchemaError[] {
  if (draftRecord === undefined) {
    const ajv = createAjv();
    ajv.addSchema(readSchema(DRAFT_RECORD_SCHEMA_FILE));
    draftRecord = ajv.getSchema(schemaId(DRAFT_RECORD_SCHEMA_FILE)) as Validator;
  }
  return draftRecord(value) ? [] : toSchemaErrors(draftRecord.errors);
}
