import { Global, Module } from '@nestjs/common';
import { PolicyClient } from './policy.client';
import { DetectionClient } from './detection.client';
import { AuditClient } from './audit.client';
import { RedactClient } from './redact.client';

@Global()
@Module({
  providers: [PolicyClient, DetectionClient, AuditClient, RedactClient],
  exports: [PolicyClient, DetectionClient, AuditClient, RedactClient],
})
export class ClientsModule {}
