# src/mcp/stdio.transport.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: stdin/stdout 기반 JSON-RPC 2.0 line-delimited 루프 (desktop client 용).
- 진입점에서의 거리 / Distance from entrypoint: 1 (main.ts 에서 호출).
- 라인 수 / LOC: 86.
- 주요 export / Exports: `startStdioTransport()`.
- 의존 모듈 / Depends on (internal): `../app.module`, `./tool-registry.service`.
- 사용된 외부 패키지 / External packages used: `@nestjs/core`, `@nestjs/common`.
- 부수효과 / Side effects: stdin/stdout/stderr I/O, process.exit, Nest application context 생성.
- 동시성 모델 / Concurrency model: stdin 'data' 이벤트마다 async dispatch. 동시 실행 가능(awaits 직렬화 안 함).
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/mcp/stdio.transport.ts lines=1-17
/**
 * Minimal MCP stdio transport: JSON-RPC 2.0 over line-delimited JSON.
 *
 * Bootstraps the NestJS DI container WITHOUT a HTTP listener, fetches the
 * tool registry, and pipes JSON-RPC frames between stdin and stdout. This is
 * what desktop clients (Claude Desktop, Gemini CLI, Cursor) consume.
 *
 * NOTE: stdout MUST stay JSON-RPC-clean. Logs go to stderr.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ToolRegistryService } from './tool-registry.service';

export async function startStdioTransport(): Promise<void> {
  const log = new Logger('Stdio');
  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
```

**분석 / Analysis (Level 2)**

- **L8 주석** — “stdout MUST stay JSON-RPC-clean”. 이 코드에서 `process.stdout.write` 는 한 곳뿐(L23) 이고 모두 `JSON.stringify(msg) + '\n'`. 다른 어떤 코드가 console.log 를 호출하면 깨진다. Nest 의 Logger 가 stdout 으로 가지 않게 `logger: false` 로 막음.
- **L17 `createApplicationContext`** — HTTP listener 없이 DI 만 부트. controller route 는 등록되지 않는다(필요 없음).

```ts path=src/mcp/stdio.transport.ts lines=18-48
  const registry = ctx.get(ToolRegistryService);

  process.stdin.setEncoding('utf8');
  let buf = '';

  const write = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + '\n');

  process.stdin.on('data', async (chunk: string) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let req: any;
      try {
        req = JSON.parse(line);
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse_error' } });
        continue;
      }
      try {
        const result = await dispatch(registry, req.method, req.params);
        if (req.id !== undefined) write({ jsonrpc: '2.0', id: req.id, result });
      } catch (e) {
        if (req.id !== undefined) {
          write({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: (e as Error).message } });
        }
      }
    }
  });
```

- **L18 `ctx.get(ToolRegistryService)`** — `McpModule.exports` 로 노출된 provider. inject 흐름은 ctor 의 OrchestratorService + PolicyClient → ClientsModule + OrchestratorModule(@Global) 로 자동 해결.
- **L20 `setEncoding('utf8')`** — 청크를 Buffer 아닌 string 으로 전달.
- **L21 `let buf = ''`** — **흔한 실수**: 안 비워짐. 클라가 줄바꿈 없이 거대한 페이로드를 흘려보내면 `buf` 가 무한 증가 → OOM. 길이 상한(예: 1MB) 권장.
- **L23 `write`** — JSON.stringify 시 BigInt/순환 참조 발견 시 throw — caller 의 dispatch 가 plain object 만 반환하는 한 OK.
- **L25-47 stdin 'data' 핸들러** — async 콜백. `await dispatch` 가 안 끝났는데 다음 chunk 가 들어오면 새 핸들러 인스턴스가 또 실행. 즉 **요청 순서 보장 없음**. 동일 line 내 frame 은 while 루프로 직렬, 하지만 frame 간 await 가 끼면 다른 'data' 이벤트가 끼어들 수 있다. MCP 명세상 응답에 `id` 가 있어 클라가 매칭하므로 응답 순서는 신경 안 써도 되지만, downstream 사이드이펙트(Audit) 가 동시 실행될 수 있다는 점은 주의.
- **L28-30 line splitting** — `\n` 기반. `\r\n` 입력 시 `\r` 가 trim 으로 제거됨. OK.
- **L32 `if (!line) continue`** — 빈 라인 무시. heartbeat 처럼 빈 라인을 보내는 클라가 있을 수 있어 적절.
- **L33 `req: any`** — JSON 인터페이스 미정의.
- **L35-39 parse error** — `-32700 parse_error` (JSON-RPC 표준 코드). id=null(파싱 실패 시 모름) — 명세 부합.
- **L41 `await dispatch(...)`** — 결과 await.
- **L42 `if (req.id !== undefined)`** — notification(id 없음) 응답 생략 — **JSON-RPC 명세 준수**. HTTP controller 와 대조적.
- **L43-46 error 응답** — `-32000 Server error`. method not found / invalid params 구분 없음(dispatch 안에서 throw 후 코드 -32000 으로 묶임).

```ts path=src/mcp/stdio.transport.ts lines=49-57
  process.stdin.on('end', () => {
    log.warn('stdin closed, shutting down');
    ctx.close().finally(() => process.exit(0));
  });

  // Announce ready (non-standard but useful for diagnostics).
  process.stderr.write(`[guardrails-mcp] stdio ready (tools=${registry.list().length})\n`);
}
```

- **L49-52 end handler** — stdin 닫히면 graceful 종료. `ctx.close()` 가 Nest lifecycle hook 을 호출하고 `finally` 가 exit. **흔한 실수**: `process.exit(0)` 강제 종료라 비동기 큐에 남은 작업(audit POST) 이 잘릴 수 있다. `await ctx.close()` 의 비동기성에 audit POST 의 fire-and-forget 패턴까지 끼면 timing 의존.
- **L55-56 stderr announce** — JSON-RPC 가 아닌 사람-읽기 메시지를 stderr 로. stdout 분리 약속 준수.

```ts path=src/mcp/stdio.transport.ts lines=59-86
async function dispatch(registry: ToolRegistryService, method: string, params: unknown) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'guardrails-mcp', version: '0.1.0' },
        capabilities: { tools: {} },
      };
    case 'tools/list':
      return {
        tools: registry.list().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: 'object', properties: t.inputSchema },
        })),
      };
    case 'tools/call': {
      const p = params as { name: string; arguments?: unknown };
      const tool = registry.get(p.name);
      if (!tool) throw new Error(`unknown_tool:${p.name}`);
      const result = await tool.handler(p.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    default:
      throw new Error(`unknown_method:${method}`);
  }
}
```

- **L62-65 `initialize`** — MCP 핸드셰이크. protocolVersion 하드코딩. `capabilities: { tools: {} }` 는 “tools 만 지원” 신호.
- **L69-73 `tools/list`** — `inputSchema: { type: 'object', properties: t.inputSchema }` — HTTP controller 와 달리 `{ type: 'object', properties: ... }` 래퍼를 추가했다. JSON Schema 모양에 한 발 가깝지만 `t.inputSchema` 가 zod shape 라 `properties` 의 각 값이 ZodType 인스턴스(직렬화 시 비표준 형태). 여전히 표준 JSON Schema 와 다르다.
- **L75-80 `tools/call`** — `content: [{ type: 'text', text: ...stringify... }]` — MCP 명세상 tool 결과 컨테이너. JSON 을 *문자열* 로 압축해 단일 텍스트 블록으로 보내는 패턴이 MCP 의 일반 관행(클라가 보통 parsable text 로 다룬다).
- **L83 default** — `unknown_method`. method 가 빈 문자열/누락이면 그대로 메시지에 노출.

**짚어볼 점 / Watch-outs**
- **OOM**: `buf` 길이 제한 없음.
- **요청 동시 실행**: stdin 'data' 콜백이 await 후에도 다음 chunk 핸들러와 interleave.
- **JSON Schema 정합성**: zod shape 가 properties 에 직접 들어감.
- **HTTP 컨트롤러와 method 집합 불일치** (`initialize` 누락).
- **process.exit(0)** 강제 종료 — pending audit drop 가능.
- **error 코드 다양화 부재**.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) stdout 분리 규약 준수. (2) `id !== undefined` 시에만 응답 — JSON-RPC notification 명세 부합. (3) parse_error 코드 정확.
- 위험 / Risks: (1) 무한 buf. (2) inputSchema 표준 미달. (3) 종료 시 in-flight 손실.
- 개선 권고 / Recommendations: (1) `MAX_BUF=1<<20` 도입 + 초과 시 reset + stderr. (2) HTTP 의 dispatch 와 통합. (3) `await Promise.allSettled(pending)` 후 exit. (4) `zod-to-json-schema` 통합.
- 재읽기 권고 레벨 / Suggested re-read level: 3 — desktop client 와의 호환성 영향이 큰 핵심 표면.
