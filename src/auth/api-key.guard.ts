import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Runtime } from '../config/runtime';

/**
 * API-key check for the HTTP transport.
 *
 * Auth mode is controlled by the MCP_HTTP_AUTH env var:
 *   - "optional" (default): requests are allowed without a key. This lets a
 *     remote client connect with no extra headers, e.g.
 *       npx -y mcp-remote http://<host>:<port>/mcp
 *     Intended for LAN / trusted-network / behind-a-gateway deployments.
 *   - "required": every request must present the key, via either
 *       x-api-key: <key>                 or
 *       Authorization: Bearer <key>
 *     Use this when the server is exposed on an untrusted network (front it
 *     with TLS too). With mcp-remote:
 *       npx -y mcp-remote http://<host>:<port>/mcp --header "x-api-key:<key>"
 *
 * Stdio transport bypasses this guard entirely (the channel is OS-permission
 * scoped). In production prefer OAuth client-credentials + key rotation.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const mode = (process.env.MCP_HTTP_AUTH ?? 'optional').toLowerCase();
    if (mode !== 'required') return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const headerKey = (req.headers['x-api-key'] as string) ?? '';
    const authz = (req.headers['authorization'] as string) ?? '';
    const bearer = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
    const provided = headerKey || bearer;
    if (provided !== Runtime.apiKey) {
      throw new UnauthorizedException('invalid_api_key');
    }
    return true;
  }
}
