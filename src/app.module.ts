import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { McpModule } from './mcp/mcp.module';
import { ClientsModule } from './clients/clients.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ClientsModule,
    OrchestratorModule,
    McpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
