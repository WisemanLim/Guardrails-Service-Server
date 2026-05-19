import { Controller, Get } from '@nestjs/common';
import { Runtime } from '../config/runtime';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      transport: Runtime.transport,
      enabledDomains: Runtime.enabledDomains,
      enabledLocales: Runtime.enabledLocales,
      downstream: {
        policy: Runtime.policyEngineUrl,
        detection: Runtime.detectionEngineUrl,
        audit: Runtime.auditServiceUrl,
      },
    };
  }
}
