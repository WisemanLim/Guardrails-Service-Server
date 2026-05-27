# src/main.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: 프로세스 부트스트랩 — transport 종류에 따라 stdio 또는 HTTP NestJS 앱을 띄운다.
- 진입점에서의 거리 / Distance from entrypoint: 0 (entry).
- 라인 수 / LOC: 25.
- 주요 export / Exports: 없음 (top-level IIFE `bootstrap()` 호출).
- 의존 모듈 / Depends on (internal): `./app.module`, `./mcp/stdio.transport`.
- 사용된 외부 패키지 / External packages used: `@nestjs/core`, `@nestjs/common`.
- 부수효과 / Side effects: HTTP 포트 listen, Logger 출력, stdio 핸들러 등록.
- 동시성 모델 / Concurrency model: Node 이벤트 루프 단일 스레드, bootstrap 은 async.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/main.ts lines=1-25
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
```

**분석 / Analysis (Level 2)**

- **L1-4 imports** — `NestFactory` 는 동기 모듈로 import 되지만 `create()` 자체는 async 다. `startStdioTransport` 는 named export 라 tree-shake 가능 (commonjs 빌드에선 큰 의미는 없음).
- **L6 `async function bootstrap()`** — Nest 표준 패턴. 함수 외부에서 await 하지 않고 L24 에서 fire-and-forget — top-level await 가 commonjs 에선 불가능하기 때문이다. 흔한 실수: 여기서 promise rejection 이 발생하면 Node 가 `UnhandledPromiseRejectionWarning` 후 종료 코드 1 로 끝난다. 명시적 `.catch(err => { log.error(err); process.exit(1); })` 가 더 안전.
- **L7 `process.env.MCP_TRANSPORT ?? 'http'`** — nullish coalescing 이라 `''` 빈 문자열은 `''` 그대로 통과 → `.toLowerCase()` 후 `'stdio'` 와 같지 않으므로 HTTP 분기로 falls through. 의도와 일치하지만, 명시적 정규화(`'http' | 'stdio'` 외 값은 fatal) 도 고려할 만하다.
- **L10-14 stdio 분기** — HTTP listener 가 띄워지지 않는 게 핵심. Claude Desktop 이 process 를 fork 해 stdin/stdout 으로만 통신하므로 포트를 열면 안 된다. `return` 으로 즉시 종료.
- **L17 `bufferLogs: false`** — 기본값(false)이라 사실상 no-op. 의도는 “부팅 직후 로그를 바로 출력” 으로 보인다. 명시 자체에 해는 없다.
- **L18 `app.enableShutdownHooks()`** — SIGINT/SIGTERM 시 `onModuleDestroy` / `OnApplicationShutdown` 훅이 동작. 컨테이너 환경(Docker) 종료 시 graceful 종료에 필수.
- **L19 `Number(process.env.PORT ?? 8080)`** — `Number('')` 은 0 이고 `Number(undefined)` 는 NaN. `??` 가 undefined/null 만 잡으므로 `PORT=` 같이 빈 문자열이면 0 으로 listen 시도(자동 포트). 흔한 실수. 견고하게 하려면 `Number.isFinite` 체크.
- **L20 `app.listen(port, '0.0.0.0')`** — 모든 인터페이스에 바인딩. 컨테이너 외부 접근 허용. host network 가 아니라 docker bridge 일 때 필요. 보안상 신뢰 망(internal) 가정.
- **L24 `bootstrap();`** — IIFE 미사용, 그냥 호출. 위 L6 분석과 동일 — promise rejection 처리 누락.

**짚어볼 점 / Watch-outs**
- 미처리 reject: `bootstrap().catch(...)` 추가 권장.
- `PORT` 검증: `0` 또는 음수 입력 방어 없음.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) transport 분기가 한 곳에서 명확. (2) `enableShutdownHooks()` 로 컨테이너 친화적. (3) 매우 얇아 인지부담 낮음.
- 위험 / Risks: (1) bootstrap reject 미처리. (2) PORT 파싱 방어 없음.
- 개선 권고 / Recommendations: (1) `.catch` 핸들러 추가. (2) PORT/Transport 정규화 유틸로 분리(`config/runtime.ts` 에 흡수). (3) `MCP_TRANSPORT` 가 stdio/http 외 값일 때 fatal 또는 warn.
- 재읽기 권고 레벨 / Suggested re-read level: 1 — 단순 부트스트랩이라 추가 리뷰 가치 낮음.
