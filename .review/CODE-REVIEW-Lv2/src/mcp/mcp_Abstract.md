# src/mcp/ — 디렉토리 개요

> [← INDEX.md](../../INDEX.md)

## 파일 목록

| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| [mcp.controller.ts](./mcp.controller.ts.md) | 104 | HTTP/SSE/JSON-RPC endpoints (x-api-key 보호) |
| [mcp.module.ts](./mcp.module.ts.md) | 11 | Controller + ToolRegistry provider |
| [stdio.transport.ts](./stdio.transport.ts.md) | 86 | stdin/stdout JSON-RPC 루프 |
| [tool-registry.service.ts](./tool-registry.service.ts.md) | 139 | 8 tool 등록 + zod 검증 + handler |

## 디렉토리 구조 요약

MCP transport 의 두 축: HTTP(controller) + stdio(transport). 둘 다 `ToolRegistryService` 에 의존해 동일한 8개 tool 을 노출한다.

## 주요 의존 관계

- `tool-registry.service.ts` → `orchestrator/orchestrator.service`, `clients/policy.client`, `config/runtime`
- `mcp.controller.ts` → `auth/api-key.guard`, `tool-registry.service`
- `stdio.transport.ts` → `app.module`, `tool-registry.service` (NestFactory.createApplicationContext 로 직접 인스턴스 획득)

## 위험 신호

- 컨트롤러의 `body: any` (JSON-RPC).
- stdio buf 길이 제한 없음(OOM 위험).
- `inputSchema: ZodObject.shape` 가 JSON Schema 가 아님 — MCP introspection 호환성 문제.
- `explain_decision` tool 이 axios 를 동적으로 import 해 직접 호출 — AuditClient 우회.
