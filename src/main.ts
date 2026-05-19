import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { startStdioTransport } from './mcp/stdio.transport';

async function bootstrap() {
  const transport = (process.env.MCP_TRANSPORT ?? 'http').toLowerCase();
  const log = new Logger('Bootstrap');

  if (transport === 'stdio') {
    // Pure stdio mode for desktop clients (Claude Desktop, Gemini CLI, etc.).
    // No HTTP listener — keep stdout strictly JSON-RPC.
    await startStdioTransport();
    return;
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
  log.log(`MCP Server (HTTP) listening on :${port}`);
}

bootstrap();
