# src/health/ — 디렉토리 개요

> [← INDEX.md](../../INDEX.md)

## 파일 목록

| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| [health.controller.ts](./health.controller.ts.md) | 21 | `GET /health` |

## 디렉토리 구조 요약

단일 컨트롤러. 가드가 붙어 있지 않다(liveness probe 의도).

## 주요 의존 관계

- `config/runtime.ts` 만.

## 위험 신호

- 응답 본문에 다운스트림 URL 4종 노출. 내부망/사설 라우팅 가정 필요.
