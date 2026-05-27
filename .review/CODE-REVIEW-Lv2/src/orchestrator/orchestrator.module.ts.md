# src/orchestrator/orchestrator.module.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: `OrchestratorService` 글로벌 provider.
- 진입점에서의 거리 / Distance from entrypoint: 2.
- 라인 수 / LOC: 7.
- 주요 export / Exports: `class OrchestratorModule`.
- 의존 모듈 / Depends on (internal): `./orchestrator.service`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`.

---

```ts path=src/orchestrator/orchestrator.module.ts lines=1-7
import { Global, Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

@Global()
@Module({ providers: [OrchestratorService], exports: [OrchestratorService] })
export class OrchestratorModule {}
```

**분석 / Analysis (Level 2)**

- `@Global` 로 `ToolRegistryService` 가 어디서든 inject. 사용처는 사실 단일.

**짚어볼 점 / Watch-outs**
- 없음.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: 간결.
- 위험 / Risks: 없음.
- 개선 권고 / Recommendations: (1) `@Global` 제거 + `McpModule.imports: [OrchestratorModule]` 명시.
- 재읽기 권고 레벨 / Suggested re-read level: 0.
