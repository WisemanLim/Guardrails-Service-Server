import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

@Global()
@Module({ providers: [ApiKeyGuard], exports: [ApiKeyGuard] })
export class AuthModule {}
