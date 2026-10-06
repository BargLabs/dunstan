// Finds the declared block in a completion report (spec/claim-format.md section 2). The scanner is
// the spec's line algorithm, not a general Markdown parser, so every checker finds the same blocks.

import { BLOCK_INFO_STRING, SUPPORTED_BLOCK_VERSIONS } from './constants.js';
import { sha256Canonical } from './jcs.js';
import { JsonReadError, type JsonValue, parseStrictJson } from './json.js';
import { validateBlock } from './schema.js';

export type BlockErrorCode =
  | 'unterminated_fence'
  | 'invalid_json'
  | 'duplicate_member'
  | 'unsupported_version'
  | 'schema_violation';

export interface BlockError {
  code: BlockErrorCode;
  message: string;
  pointer?: string;
  keyword?: string;
}

export type ExtractResult =
  | { status: 'found'; value: JsonValue; sha256: string }
  | { status: 'missing' }
  | { status: 'ambiguous'; count: number }
  | { status: 'invalid'; errors: BlockError[] };

const OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

interface Fence {
  char: string;
  length: number;
  handback: boolean;
  lines: string[];
}

interface ScannedBlock {
  content: string;
  terminated: boolean;
}

function isClosingFence(line: string, fence: Fence): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  const run = match?.[1];
  return run !== undefined && run[0] === fence.char && run.length >= fence.length;
}

export function scanHandbackBlocks(reportText: string): ScannedBlock[] {
  const text = reportText.startsWith('﻿') ? reportText.slice(1) : reportText;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ScannedBlock[] = [];
  let open: Fence | undefined;

  for (const line of lines) {
    if (open !== undefined) {
      if (isClosingFence(line, open)) {
        if (open.handback) blocks.push({ content: open.lines.join('\n'), terminated: true });
        open = undefined;
      } else if (open.handback) {
        open.lines.push(line);
      }
      continue;
    }
    const match = OPENING_FENCE.exec(line);
    const run = match?.[1];
    if (run === undefined) continue;
    const info = (match?.[2] ?? '').replace(/^[ \t]+|[ \t]+$/g, '');
    // CommonMark: a backtick fence's info string may not contain a backtick.
    if (run[0] === '`' && info.includes('`')) continue;
    open = {
      char: run[0] as string,
      length: run.length,
      handback: info === BLOCK_INFO_STRING,
      lines: [],
    };
  }
  if (open?.handback) blocks.push({ content: open.lines.join('\n'), terminated: false });
  return blocks;
}

const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function versionSupported(version: string): boolean {
  const [major, minor] = version.split('.');
  return SUPPORTED_BLOCK_VERSIONS.some((supported) => {
    const [sMajor, sMinor] = supported.split('.');
    // While the major is 0 each minor is its own major (semver item 4).
    return major === '0' ? major === sMajor && minor === sMinor : major === sMajor;
  });
}

export function readBlockContent(content: string): ExtractResult {
  let value: JsonValue;
  try {
    value = parseStrictJson(content);
  } catch (e) {
    if (e instanceof JsonReadError) {
      const error: BlockError = { code: e.code, message: e.message };
      if (e.pointer !== undefined) error.pointer = e.pointer;
      return { status: 'invalid', errors: [error] };
    }
    throw e;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const declared = value.dunstan;
    if (typeof declared === 'string' && VERSION.test(declared) && !versionSupported(declared)) {
      return {
        status: 'invalid',
        errors: [
          {
            code: 'unsupported_version',
            message: `block declares dunstan ${declared}; this checker implements ${SUPPORTED_BLOCK_VERSIONS.join(', ')}`,
            pointer: '/dunstan',
          },
        ],
      };
    }
  }

  const schemaErrors = validateBlock(value);
  if (schemaErrors.length > 0) return { status: 'invalid', errors: schemaErrors };
  return { status: 'found', value, sha256: sha256Canonical(value) };
}

export function extractHandbackBlock(reportText: string): ExtractResult {
  const blocks = scanHandbackBlocks(reportText);
  if (blocks.length === 0) return { status: 'missing' };
  if (blocks.length > 1) return { status: 'ambiguous', count: blocks.length };
  const block = blocks[0] as ScannedBlock;
  if (!block.terminated) {
    return {
      status: 'invalid',
      errors: [
        { code: 'unterminated_fence', message: 'the dunstan-handback fence is never closed' },
      ],
    };
  }
  return readBlockContent(block.content);
}
