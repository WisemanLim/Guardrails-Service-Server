# src/config/ — 디렉토리 개요

> [← INDEX.md](../../INDEX.md)

## 파일 목록

| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| [runtime.ts](./runtime.ts.md) | 18 | `process.env` → 정적 상수 객체 `Runtime`. |

## 디렉토리 구조 요약

설정 한 곳. 모듈 평가 시점에 한 번 ENV 를 읽어 `Runtime` 으로 동결한다. 핫 리로드 불가.

## 주요 의존 관계

- 외부 import: 거의 모든 모듈이 `Runtime` 을 가져온다 (api-key.guard, clients/*, health.controller, orchestrator.service, tool-registry.service).

## 위험 신호

- ConfigModule.forRoot 와 평가 순서가 깨질 가능성 (위 INDEX §4.1 참조).
- `apiKey` default `'dev-key-please-change'` — prod 부팅 가드 없음.
- `csv()` 가 `','` 분리만 지원 — escaping 없음. CSV 내 `,` 가 포함된 값 미지원 (현재 도메인/locale 에선 비현실적).
