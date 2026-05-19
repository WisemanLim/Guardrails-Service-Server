/**
 * Minimal MCP stdio transport: JSON-RPC 2.0 over line-delimited JSON.
 *
 * Bootstraps the NestJS DI container WITHOUT a HTTP listener, fetches the
 * tool registry, and pipes JSON-RPC frames between stdin and stdout. This is
 * what desktop clients (Claude Desktop, Gemini CLI, Cursor) consume.
 *
 * NOTE: stdout MUST stay JSON-RPC-clean. Logs go to stderr.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ToolRegistryService } from './tool-registry.service';

export async function startStdioTransport(): Promise<void> {
  const log = new Logger('Stdio');
  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const registry = ctx.get(ToolRegistryService);

  process.stdin.setEncoding('utf8');
  let buf = '';

  const write = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + '\n');

  process.stdin.on('data', async (chunk: string) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let req: any;
      try {
        req = JSON.parse(line);
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse_error' } });
        continue;
      }
      try {
        const result = await dispatch(registry, req.method, req.params);
        if (req.id !== undefined) write({ jsonrpc: '2.0', id: req.id, result });
      } catch (e) {
        if (req.id !== undefined) {
          write({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: (e as Error).message } });
        }
      }
    }
  });

  process.stdin.on('end', () => {
    log.warn('stdin closed, shutting down');
    ctx.close().finally(() => process.exit(0));
  });

  // Announce ready (non-standard but useful for diagnostics).
  process.stderr.write(`[guardrails-mcp] stdio ready (tools=${registry.list().length})\n`);
}

async function dispatch(registry: ToolRegistryService, method: string, params: unknown) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'guardrails-mcp', version: '0.1.0' },
        capabilities: { tools: {} },
      };
    case 'tools/list':
      return {
        tools: registry.list().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: 'object', properties: t.inputSchema },
        })),
      };
    case 'tools/call': {
      const p = params as { name: string; arguments?: unknown };
      const tool = registry.get(p.name);
      if (!tool) throw new Error(`unknown_tool:${p.name}`);
      const result = await tool.handler(p.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    default:
      throw new Error(`unknown_method:${method}`);
  }
}
