# src/auth/ — 디렉토리 개요

> [← INDEX.md](../../INDEX.md)

## 파일 목록

| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| [api-key.guard.ts](./api-key.guard.ts.md) | 22 | `x-api-key` 헤더 ↔ `Runtime.apiKey` 검증 |
| [auth.module.ts](./auth.module.ts.md) | 7 | `@Global()` 모듈, ApiKeyGuard provider |

## 디렉토리 구조 요약

HTTP transport 만 보호한다. stdio 는 OS 권한 스코프라 가드를 거치지 않는다(설계 의도).

## 주요 의존 관계

- `api-key.guard.ts` → `config/runtime.ts`
- 사용처: `mcp/mcp.controller.ts` (`@UseGuards(ApiKeyGuard)`)
- `/health` 는 보호되지 않음(liveness probe).

## 위험 신호

- 평문 비교 (`!==`) — timing attack 노출. `crypto.timingSafeEqual` 권장.
- default key 인 상태로 prod 부팅 가능.
- 다중 키/로테이션/스코프 없음 — M2 RBAC 시 전면 교체 필요.
