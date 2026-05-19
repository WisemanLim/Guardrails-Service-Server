import {
  Body,
  Controller,
  Get,
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

/**
 * HTTP transport for the MCP tool surface.
 *
 * Two flavors:
 *   POST /mcp/tools/:name        — flat REST (easiest to curl/test)
 *   POST /mcp                    — JSON-RPC 2.0 (closer to native MCP shape)
 *   GET  /mcp/sse                — SSE event stream (placeholder; minimal heartbeat
 *                                  so `mcp-remote` and similar bridges connect cleanly.
 *                                  Full bidirectional SSE requires the upstream MCP
 *                                  SDK and is wired up in a follow-up.)
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

  @Post()
  async jsonRpc(@Body() body: any) {
    if (!body || body.jsonrpc !== '2.0') {
      throw new HttpException('expected_jsonrpc_2_0', HttpStatus.BAD_REQUEST);
    }
    const { id, method, params } = body;
    try {
      const result = await this.dispatch(method, params);
      return { jsonrpc: '2.0', id, result };
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: (e as Error).message },
      };
    }
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

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    if (method === 'tools/list') {
      return { tools: this.registry.list().map((t) => ({ name: t.name, description: t.description })) };
    }
    if (method === 'tools/call') {
      const p = params as { name: string; arguments?: unknown };
      const tool = this.registry.get(p.name);
      if (!tool) throw new Error(`unknown_tool:${p.name}`);
      return tool.handler(p.arguments ?? {});
    }
    throw new Error(`unknown_method:${method}`);
  }
}
