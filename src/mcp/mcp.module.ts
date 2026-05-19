import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  controllers: [McpController],
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class McpModule {}
