import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Runtime } from '../config/runtime';

/**
 * Trivial API-key check for the HTTP transport. Stdio bypasses this since
 * the channel itself is OS-permission scoped.
 *
 * In production, replace with OAuth client-credentials + key rotation.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = (req.headers['x-api-key'] as string) ?? '';
    if (provided !== Runtime.apiKey) {
      throw new UnauthorizedException('invalid_api_key');
    }
    return true;
  }
}
