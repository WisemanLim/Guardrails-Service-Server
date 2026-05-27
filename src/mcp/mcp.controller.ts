import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ToolRegistryService } from './tool-registry.service';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = {
  name: process.env.MCP_SERVER_NAME ?? 'guardrails-mcp-server',
  version: process.env.MCP_SERVER_VERSION ?? '0.1.0',
};

/**
 * HTTP transport for the MCP tool surface.
 *
 *   POST /mcp                 — JSON-RPC 2.0, Streamable-HTTP compatible.
 *                               This is the endpoint `mcp-remote` connects to:
 *                                 npx -y mcp-remote http://<host>:<port>/mcp
 *                               Handles initialize / notifications/initialized /
 *                               ping / tools/list / tools/call in stateless mode
 *                               (each POST is self-contained; no session id).
 *   GET  /mcp                 — 405 (no server→client GET stream; stateless).
 *   POST /mcp/tools/:name     — flat REST (easiest to curl/test).
 *   GET  /mcp/tools           — tool catalog (name/description/inputSchema).
 *   GET  /mcp/sse             — legacy SSE heartbeat (kept for older bridges).
 *
 * Auth is governed by ApiKeyGuard (MCP_HTTP_AUTH=optional|required).
 */
@Controller('mcp')
@UseGuards(ApiKeyGuard)
export class McpController {
  private readonly log = new Logger(McpController.name);

  constructor(private readonly registry: ToolRegistryService) {}

  @Get('tools')
  listTools() {
    return {
      tools: this.registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  @Post('tools/:name')
  async callTool(@Param('name') name: string, @Body() args: unknown) {
    const tool = this.registry.get(name);
    if (!tool) throw new HttpException(`unknown_tool:${name}`, HttpStatus.NOT_FOUND);
    try {
      return await tool.handler(args ?? {});
    } catch (e) {
      const msg = (e as Error).message;
      throw new HttpException({ error: 'tool_failed', tool: name, message: msg }, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * JSON-RPC 2.0 endpoint. Accepts a single message or a batch array.
   * Notifications (no `id`) produce no response, per JSON-RPC.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async jsonRpc(@Body() body: unknown) {
    if (Array.isArray(body)) {
      const out: unknown[] = [];
      for (const msg of body) {
        const r = await this.handleMessage(msg);
        if (r) out.push(r);
      }
      return out; // empty array if the batch was all notifications
    }
    return (await this.handleMessage(body)) ?? {};
  }

  /**
   * Streamable HTTP allows an optional server→client GET stream. We run
   * stateless, so advertise "no GET stream" with 405 (clients fall back to
   * plain request/response over POST).
   */
  @Get()
  getStream(@Res() res: Response) {
    res
      .status(HttpStatus.METHOD_NOT_ALLOWED)
      .json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'method_not_allowed: use POST /mcp' } });
  }

  @Get('sse')
  sse(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    send('ready', { tools: this.registry.list().map((t) => t.name) });
    const heartbeat = setInterval(() => send('ping', { ts: Date.now() }), 15_000);
    res.on('close', () => clearInterval(heartbeat));
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async handleMessage(body: any): Promise<Record<string, unknown> | null> {
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32600, message: 'invalid_request' } };
    }
    const { id, method, params } = body;
    const isNotification = id === undefined || id === null;
    try {
      const result = await this.dispatch(method, params);
      if (isNotification) return null;
      return { jsonrpc: '2.0', id, result };
    } catch (e) {
      if (isNotification) return null;
      const message = (e as Error).message;
      const code = message.startsWith('unknown_method') ? -32601 : -32000;
      return { jsonrpc: '2.0', id, error: { code, message } };
    }
  }

  private async dispatch(method: string, params: any): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        };

      // Notifications + keepalive — empty ack (notifications get dropped upstream).
      case 'notifications/initialized':
      case 'initialized':
      case 'notifications/cancelled':
      case 'ping':
        return {};

      case 'tools/list':
        return {
          tools: this.registry.list().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        };

      case 'tools/call': {
        const p = (params ?? {}) as { name: string; arguments?: unknown };
        const tool = this.registry.get(p.name);
        if (!tool) throw new Error(`unknown_tool:${p.name}`);
        try {
          const result = await tool.handler(p.arguments ?? {});
          const text = typeof result === 'string' ? result : JSON.stringify(result);
          return { content: [{ type: 'text', text }] };
        } catch (e) {
          return { content: [{ type: 'text', text: `tool_failed: ${(e as Error).message}` }], isError: true };
        }
      }

      default:
        throw new Error(`unknown_method:${method}`);
    }
  }
}
