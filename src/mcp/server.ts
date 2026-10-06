// The MCP self-check: dunstan_check_handback, that a coding agent calls before it says a task is
// done. It takes the subject and the block (or the report that carries it) and returns the verdict,
// the claims table and the record. It is `dunstan check` with a different caller: the report is
// resolved here, and everything after that is the CLI's own recordReport, so on the same evidence
// the two give the same claims, verdict and digests (src/mcp/parity.test.ts).
//
// Beside it, dunstan_suggest_declarations is `dunstan suggest`: offline, no subject, the same text.
// It is a sibling tool rather than an option of the check because it needs no pull request and
// reads nothing, and its output is never a verdict.
//
// Read-only: GITHUB_TOKEN from the environment, metadata reads only, nothing written to GitHub or the
// repository. The record is written to a file only when the caller passes outPath, and never over an
// existing file. An error comes back as a tool error, never as a verdict.

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { blockOfReport, defaultRecordFile, REPOSITORY, recordReport } from '../cli/check.js';
import { renderRecord } from '../cli/output.js';
import { PullRequestUnreadable, readPullRequest } from '../evidence/github.js';
import { GitHubClient } from '../evidence/http.js';
import type { Report } from '../evidence/report.js';
import {
  type DunstanRecord,
  type RecordBlock,
  recordBlock,
  serializeRecord,
} from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { readBlockContent } from '../spec/extract.js';
import { CanonicalizationError, canonicalize } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { suggestText } from '../suggest/suggest.js';

export const TOOL_NAME = 'dunstan_check_handback';
export const SUGGEST_TOOL_NAME = 'dunstan_suggest_declarations';

export interface DunstanMcpOptions {
  // The URL of the running checker artifact, whose digest the record carries.
  artifact: string;
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
  // Diagnostics (stderr under stdio), never the protocol stream.
  warn: (text: string) => void;
}

export interface CheckHandbackInput {
  repository: string;
  pullRequest: number;
  block?: Record<string, unknown> | undefined;
  report?: string | undefined;
  outPath?: string | undefined;
}

class InputError extends Error {}

const INSTRUCTIONS = `Before you say a task is done: generate your dunstan-handback block with \`dunstan template\` and add your test and reference claims; call ${SUGGEST_TOOL_NAME} with your report and declare or reword each sentence it lists; then call ${TOOL_NAME} with your pull request and the block. If the verdict is not pass, report the rows as they are; never edit the block to make it pass without changing the work. The check reads only what the block declares; the prose is yours to bring into the block.`;

const SUGGEST_DESCRIPTION = `List the sentences in your report's prose that look like claims your dunstan-handback block does not declare, before you say done. Give report, the report text. For each, declare it in the block, or reword it if it is not a claim about this PR. Offline: needs no pull request, reads nothing and writes nothing. Never a verdict: nothing passes or fails, and nothing is written to a record. The same text as \`dunstan suggest\`.`;

const DESCRIPTION = `Check a completion handback against the repository's own record, before you say done. Give the subject (repository owner/name and pull request number) and exactly one of: block, the dunstan-handback block as a JSON object; or report, the report text that carries exactly one \`\`\`dunstan-handback fence. Returns the verdict (pass, fail or unverifiable), the claims table, and the full record as JSON. Same checker and same verdict as \`dunstan check\` on the same evidence; no model decides. Reads GitHub metadata with GITHUB_TOKEN and writes nothing to GitHub or the repository; the record is written to a file only when you pass outPath. If the verdict is not pass, report the rows as they are; change the work, not the block.`;

// A block given as an object is read exactly as the content of a handback fence (spec section 5):
// the report is the block's RFC 8785 bytes, so version and schema checks are the same as for a block
// found in a report. Duplicate member names cannot be seen here: the request was parsed already.
function reportOfBlock(block: Record<string, unknown>): { report: Report; block: RecordBlock } {
  const text = canonicalize(block as JsonValue);
  return {
    report: {
      bytes: new TextEncoder().encode(text),
      source: { kind: 'api', locator: `mcp ${TOOL_NAME}#block` },
    },
    block: recordBlock(readBlockContent(text)),
  };
}

function reportOfText(text: string): { report: Report; block: RecordBlock } {
  const report: Report = {
    bytes: new TextEncoder().encode(text),
    source: { kind: 'api', locator: `mcp ${TOOL_NAME}#report` },
  };
  return { report, block: blockOfReport(report) };
}

export async function checkHandback(
  input: CheckHandbackInput,
  options: DunstanMcpOptions,
): Promise<CallToolResult> {
  if ((input.block === undefined) === (input.report === undefined)) {
    throw new InputError(
      'pass exactly one of block (the handback block as a JSON object) or report (text carrying one dunstan-handback fence)',
    );
  }
  const outPath = input.outPath === undefined ? undefined : resolve(input.outPath);
  if (outPath !== undefined && existsSync(outPath)) {
    throw new InputError(`${outPath} exists; the tool never overwrites a file`);
  }
  const { report, block } =
    input.block !== undefined ? reportOfBlock(input.block) : reportOfText(input.report as string);

  const notes: string[] = [];
  const client = new GitHubClient({
    token: options.env.GITHUB_TOKEN,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    warn: (message) => {
      notes.push(message);
      options.warn(`dunstan: ${message}\n`);
    },
  });
  if (!client.hasToken) {
    notes.push('GITHUB_TOKEN is not set; read anonymously');
    options.warn('dunstan: GITHUB_TOKEN is not set; reading anonymously\n');
  }

  const pullRequest = await readPullRequest(client, input.repository, input.pullRequest);
  const record = await recordReport(client, {
    pullRequest,
    report,
    block,
    artifact: options.artifact,
    recordFile: outPath ?? defaultRecordFile(pullRequest.repository, input.pullRequest),
  });
  const serialized = serializeRecord(record);
  if (outPath !== undefined) writeFileSync(outPath, serialized, { flag: 'wx' });
  return handbackResult(record, outPath, notes);
}

// The tool's response for a record: the verdict lines and the claims table for the agent to read,
// then the record's exact bytes. Only the first two are worded for a reader; the record is as
// written.
export function handbackResult(
  record: DunstanRecord,
  outPath: string | undefined,
  notes: readonly string[],
): CallToolResult {
  const verdict = record.predicate.verdict;
  const head = [`verdict: ${verdict}`];
  if (verdict !== 'pass') {
    head.push('Report the rows below as they are. Change the work, not the block.');
  }
  head.push(
    outPath === undefined ? 'record: not written (pass outPath to write it)' : `record: ${outPath}`,
  );
  head.push(...notes.map((n) => `note: ${n}`));
  return {
    content: [
      { type: 'text', text: `${head.join('\n')}\n` },
      { type: 'text', text: renderRecord(record) },
      { type: 'text', text: serializeRecord(record) },
    ],
  };
}

function toolError(error: unknown): CallToolResult {
  const known =
    error instanceof InputError ||
    error instanceof PullRequestUnreadable ||
    error instanceof CanonicalizationError ||
    typeof (error as NodeJS.ErrnoException).code === 'string';
  const message = (error as Error).message ?? String(error);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `dunstan: ${known ? message : `internal error: ${message}`}\nThis is an error, not a verdict: nothing was checked.\n`,
      },
    ],
  };
}

export function createDunstanMcpServer(options: DunstanMcpOptions): McpServer {
  const server = new McpServer(
    { name: CHECKER_NAME, version: CHECKER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  server.registerTool(
    TOOL_NAME,
    {
      title: 'Check a handback against the record',
      description: DESCRIPTION,
      inputSchema: {
        repository: z
          .string()
          .regex(REPOSITORY, 'repository must be owner/name')
          .describe('The GitHub repository, owner/name.'),
        pullRequest: z
          .number()
          .int()
          .min(1)
          .max(9_999_999_999)
          .describe('The pull request number the handback is about.'),
        block: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('The dunstan-handback block as a JSON object. Give this or report, not both.'),
        report: z
          .string()
          .optional()
          .describe(
            'The report text, carrying exactly one ```dunstan-handback fence. Give this or block, not both.',
          ),
        outPath: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Write the record to this path (must not exist). Without it nothing is written.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return await checkHandback(input, options);
      } catch (error) {
        return toolError(error);
      }
    },
  );
  server.registerTool(
    SUGGEST_TOOL_NAME,
    {
      title: 'Suggest declarations from the prose',
      description: SUGGEST_DESCRIPTION,
      inputSchema: {
        report: z
          .string()
          .describe('The report text: the prose and its ```dunstan-handback fence.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => ({ content: [{ type: 'text', text: suggestText(input.report) }] }),
  );
  return server;
}
