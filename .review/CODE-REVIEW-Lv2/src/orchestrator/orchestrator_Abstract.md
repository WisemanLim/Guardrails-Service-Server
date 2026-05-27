# src/orchestrator/ — 디렉토리 개요

> [← INDEX.md](../../INDEX.md)

## 파일 목록

| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| [orchestrator.module.ts](./orchestrator.module.ts.md) | 7 | Global 모듈 |
| [orchestrator.service.ts](./orchestrator.service.ts.md) | 158 | 핵심 파이프라인 (validate/sanitize) |
| [redact.ts](./redact.ts.md) | 32 | sub_category placeholder 치환 |
| [types.ts](./types.ts.md) | 32 | Decision union + Request/Response 타입 |
| [__tests__/redact.spec.ts](./__tests__/redact.spec.ts.md) | 63 | redact 단위 테스트 3개 |

## 디렉토리 구조 요약

서버의 두뇌. `OrchestratorService.validate` 가 Policy + Detection 을 병렬로 호출하고, sub_category 기준으로 룰을 인덱싱한 뒤 가장 엄격한 결정을 채택하고, redact 후 audit 에 비동기 기록한다.

## 주요 의존 관계

- 외부: `clients/policy.client`, `clients/detection.client`, `clients/audit.client`, `config/runtime`, Node `crypto`.
- 사용처: `mcp/tool-registry.service`.

## 위험 신호

- `validate` 가 길고 분기 다수 — 테스트 0개.
- `severityRank` 결과를 변수에 담지만 사용처 없음(불용 변수).
- audit 폴백 `decisionId` 가 “local-${ts}” — explain_decision 시 404.
- `block`/`escalate` 시 `redactedText='[BLOCKED]'` — 사용자 메시지로 적합한지 PRD 합의 필요.
