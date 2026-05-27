# src/clients/ — 디렉토리 개요

> [← INDEX.md](../../INDEX.md)

## 파일 목록

| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| [audit.client.ts](./audit.client.ts.md) | 41 | POST /events — silent drop on failure |
| [clients.module.ts](./clients.module.ts.md) | 12 | Global 모듈, 3개 client provider/export |
| [detection.client.ts](./detection.client.ts.md) | 48 | POST /detect, POST /normalize |
| [policy.client.ts](./policy.client.ts.md) | 59 | GET /policies/bundle?domains&locale&ioType |

## 디렉토리 구조 요약

다운스트림 3개 HTTP 클라이언트. 각자 자신만의 `axios.create({ baseURL, timeout })` 인스턴스를 보유한다. 공유 base/인터셉터/재시도 없음.

## 주요 의존 관계

- 외부: axios, `config/runtime.ts`
- 사용처: orchestrator.service, tool-registry.service (PolicyClient)

## 위험 신호

- 인터셉터 부재 → 로깅/trace 전파/재시도 일관성 없음.
- Audit 실패는 swallow, Policy/Detection 실패는 caller (Orchestrator) 가 catch 로 무력화. Tool-registry 의 explain_decision 은 caller 가 받기.
- 다운스트림 응답 스키마 검증 없음 — `as DetectionResult` 등 타입 단언만. 다운스트림이 깨지면 런타임에서 undefined 접근.
