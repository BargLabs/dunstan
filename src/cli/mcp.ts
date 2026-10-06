// dunstan mcp: serves the MCP self-check (src/mcp/server.ts) over stdio until the client closes the
// stream. Standard output carries the protocol only; every diagnostic goes to standard error.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDunstanMcpServer } from '../mcp/server.js';
import { type CliIo, UsageError } from './output.js';

export async function mcp(args: string[], io: CliIo): Promise<number> {
  if (args.length > 0) throw new UsageError('dunstan mcp takes no arguments');
  const server = createDunstanMcpServer({
    artifact: io.artifact,
    env: io.env,
    ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    warn: io.err,
  });
  const stdin = io.stdin ?? process.stdin;
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = resolve;
  });
  stdin.once('end', () => void server.close());
  await server.connect(new StdioServerTransport(stdin, io.stdout ?? process.stdout));
  await closed;
  return 0;
}
