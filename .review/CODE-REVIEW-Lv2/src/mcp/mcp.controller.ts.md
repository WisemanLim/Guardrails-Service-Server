# src/mcp/mcp.controller.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: HTTP transport — `/mcp/tools`, `/mcp/tools/:name`, `/mcp` (JSON-RPC), `/mcp/sse`.
- 진입점에서의 거리 / Distance from entrypoint: 1.
- 라인 수 / LOC: 104.
- 주요 export / Exports: `class McpController`.
- 의존 모듈 / Depends on (internal): `../auth/api-key.guard`, `./tool-registry.service`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`, `express` (type).
- 부수효과 / Side effects: HTTP 응답, SSE 스트리밍, throw HttpException.
- 동시성 모델 / Concurrency model: async handlers, setInterval (SSE heartbeat).
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/mcp/mcp.controller.ts lines=1-30
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
```

**분석 / Analysis (Level 2)**

- **L1-12 imports** — Nest core. `Logger` 는 클래스 내 inject 됨.
- **L13 `import type { Response }`** — 타입 only.
- **L28 `@Controller('mcp')`** — prefix `mcp`. 최종 경로: `/mcp/...`.
- **L29 `@UseGuards(ApiKeyGuard)`** — 컨트롤러 레벨 → 모든 핸들러 자동 적용. `GET /mcp/tools`, `GET /mcp/sse` 까지 포함.

```ts path=src/mcp/mcp.controller.ts lines=31-45
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
```

- **L33 ctor** — `ToolRegistryService` inject. `ToolRegistry` 의 ctor 가 8개 tool 을 등록한다 → 첫 요청 전에 이미 채워짐.
- **L35-44 `listTools()`** — `inputSchema: t.inputSchema` 그대로 노출. **흔한 실수**: `inputSchema` 가 ZodObject.shape 의 raw 형태라 JSON Schema 가 아니다. 표준 MCP 클라이언트(JSON Schema 기대) 가 introspection 시 깨질 가능성.

```ts path=src/mcp/mcp.controller.ts lines=46-56
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
```

- **L47 `@Param('name')` + `@Body() args: unknown`** — `unknown` 으로 type-safe. handler 가 내부에서 zod parse.
- **L48-49 unknown_tool** — 404. 명확.
- **L50-54 try/catch + 400** — zod parse 실패 또는 downstream throw 면 400. zod 에러 메시지(`ZodError.message` JSON 형태)가 클라에 그대로 노출 — Level 2 관점: 정보 누설 미미, 디버깅 친화. prod 환경에서는 일반화 권장.
- **흔한 실수**: HttpException 의 body 에 `tool: name` 을 echo — name 이 사용자 입력이라 reflected XSS 가 *JSON 응답* 에서는 위험 없음(브라우저가 JSON 으로 해석). OK.

```ts path=src/mcp/mcp.controller.ts lines=58-75
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
```

- **L59 `body: any`** — strict TS 라 `any` 명시. JSON-RPC 프레임 형태가 자유롭다는 점은 사실이지만, 최소한 `{ jsonrpc: '2.0', id?: string|number|null, method: string, params?: unknown }` 인터페이스를 정의해 사용성을 높일 수 있다.
- **L60-62 검증** — `jsonrpc !== '2.0'` 만 검사. `method` 누락은 dispatch 가 “unknown_method:undefined” 로 반환. JSON-RPC 명세상 `method` 누락이면 `-32600 Invalid Request` 가 정석.
- **L63 destructuring** — `id` 가 누락이면 응답에 `id: undefined`. JSON-RPC 명세: notification(id 없음)은 응답 자체를 보내지 *말아야* 한다. 현 구현은 항상 응답.
- **L64-69 try/catch** — `-32000 Server error` 로 일괄. 실제 명세는 method not found 는 `-32601`, invalid params `-32602` 등 코드 분리.
- L67-69 의 `error.message` 가 zod 에러 JSON 을 그대로 노출 가능.

```ts path=src/mcp/mcp.controller.ts lines=76-89
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
```

- **L77 `@Res() res: Response`** — Nest 가 자동 응답 처리에서 빠진다(passthrough). 응답을 직접 `res.write` 로 보낸다.
- **L78-80 headers** — `Content-Type: text/event-stream` 표준. `Connection: keep-alive` 명시(HTTP/1.1 에선 기본이지만 명시 안전).
- **L81 `res.flushHeaders?.()`** — optional chaining. Express 의 `Response` 에 존재. 헤더를 즉시 flush 해 클라가 연결 ready 인식.
- **L82-85 `send` 클로저** — `event` + `data` 쌍 라인. SSE 명세에 맞음.
- **L86 `ready` 이벤트** — 도구 이름만 전달. inputSchema 없음(introspection 은 `/mcp/tools` 로).
- **L87 `setInterval(15_000)`** — 15초 ping. 일반적으로 프록시 idle timeout 회피용.
- **L88 `res.on('close', ...)`** — clearInterval. **흔한 실수**: `req.on('close')` 가 더 정확할 수 있다. Express 5 / Node 환경에 따라 `res.close` 이벤트 발화 시점이 다를 수 있음 — Node 16+ 에선 정상.
- **누락**: `res.on('error')`, timeout, 동시 SSE 연결 수 제한. 현 구현은 클라가 끊지 않으면 영속.

```ts path=src/mcp/mcp.controller.ts lines=91-103
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
```

- **L91-102 `dispatch`** — `tools/list` 와 `tools/call` 만 처리. **흔한 실수**: stdio 의 `dispatch` (`stdio.transport.ts`) 는 `initialize`, `tools/list`, `tools/call` 셋을 처리한다. HTTP 측은 `initialize` 미지원 → MCP 클라가 HTTP JSON-RPC 로 와서 `initialize` 부터 보내면 `unknown_method` 응답. 표준 MCP 핸드셰이크 깨짐.
- **L93 `tools/list`** 응답에 `inputSchema` 누락 — `/mcp/tools` 와 정합성 깨짐.
- **L96 `as { name; arguments? }`** — 타입 단언. zod 검증은 handler 내부에서.

**짚어볼 점 / Watch-outs**
- **JSON-RPC dispatch 가 `initialize` 미지원** — stdio 와 비일관.
- **`tools/list` 응답에 inputSchema 누락**.
- **JSON-RPC error code 가 -32000 단일**.
- **JSON-RPC notification(id 없음) 무조건 응답** — 명세 위반.
- **SSE 가 일방향 placeholder** — 실제 tools/call 결과 스트리밍 없음.
- **inputSchema 가 Zod shape** — JSON Schema 아님.
- **`@UseGuards` 가 `/mcp/sse` 까지 보호** — OK. 다만 SSE 가드 통과 후 영속 연결 유지 비용 주의.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 컨트롤러 레벨 가드. (2) try/catch 일관. (3) SSE placeholder 의 의도가 주석으로 분명.
- 위험 / Risks: (1) HTTP vs stdio 의 method 지원이 비일관. (2) JSON-RPC 에러 코드 단일. (3) inputSchema 포맷.
- 개선 권고 / Recommendations: (1) `dispatch` 를 HTTP/stdio 공통 함수로 추출. (2) `inputSchema` 를 `zod-to-json-schema` 로 변환. (3) JSON-RPC notification 처리(id 없음 시 응답 생략). (4) SSE 동시 연결 수 제한 + connect 로그.
- 재읽기 권고 레벨 / Suggested re-read level: 3 — MCP 호환성 핫스팟.
