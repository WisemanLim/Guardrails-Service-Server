# src/ — 디렉토리 개요

> [← INDEX.md](./INDEX.md)

## 파일 목록

| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| [main.ts](./src/main.ts.md) | 25 | bootstrap, stdio vs http 분기 |
| [app.module.ts](./src/app.module.ts.md) | 19 | NestJS 루트 모듈 |

하위 디렉토리: `auth/`, `clients/`, `config/`, `health/`, `mcp/`, `orchestrator/`.

## 디렉토리 구조 요약

`src/` 는 NestJS 표준 구조다. `main.ts` 가 두 가지 진입을 결정한다: (1) `MCP_TRANSPORT=stdio` 면 HTTP listener 없이 `startStdioTransport()` 만 띄우고, (2) 그 외엔 `NestFactory.create(AppModule)` 후 `app.listen(PORT)`. `app.module.ts` 는 5개 feature 모듈을 import 하는 얇은 컴포지션 레이어다.

## 주요 의존 관계

- `main.ts` → `app.module.ts`, `mcp/stdio.transport.ts`
- `app.module.ts` → `auth/`, `clients/`, `orchestrator/`, `mcp/`, `health/` (Controller)
- `ConfigModule.forRoot({ isGlobal: true })` 로 `.env` 자동 로드 (하지만 코드 내 ENV 접근은 모두 `config/runtime.ts` 의 정적 상수를 사용).

## 위험 신호

- `bootstrap()` 의 throw 가 unhandled — try/catch 없이 IIFE. listen 실패 시 stderr 만 출력 후 process 가 exit 1 (Node 기본). 명시적 핸들러 권장.
- ConfigModule 이 import 되어도 코드가 `process.env` 를 직접 읽으므로 효과 미미.
