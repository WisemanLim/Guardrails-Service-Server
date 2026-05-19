import { Global, Module } from '@nestjs/common';
import { PolicyClient } from './policy.client';
import { DetectionClient } from './detection.client';
import { AuditClient } from './audit.client';

@Global()
@Module({
  providers: [PolicyClient, DetectionClient, AuditClient],
  exports: [PolicyClient, DetectionClient, AuditClient],
})
export class ClientsModule {}
