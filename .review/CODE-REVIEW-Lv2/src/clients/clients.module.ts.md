# src/clients/clients.module.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: 3개 다운스트림 클라이언트를 글로벌 provider 로 노출.
- 진입점에서의 거리 / Distance from entrypoint: 2.
- 라인 수 / LOC: 12.
- 주요 export / Exports: `class ClientsModule`.
- 의존 모듈 / Depends on (internal): `./policy.client`, `./detection.client`, `./audit.client`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`.
- 부수효과 / Side effects: 없음.
- 동시성 모델 / Concurrency model: n/a.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/clients/clients.module.ts lines=1-12
import { Global, Module } from '@nestjs/common';
import { PolicyClient } from './policy.client';
import { DetectionClient } from './detection.client';
import { AuditClient } from './audit.client';

@Global()
@Module({
  providers: [PolicyClient, DetectionClient, AuditClient],
  exports: [PolicyClient, DetectionClient, AuditClient],
})
export class ClientsModule {}
```

**분석 / Analysis (Level 2)**

- **L6 `@Global()`** — `OrchestratorService` 와 `ToolRegistryService` 가 모두 inject 받기 위해 사용. 두 곳에서만 쓰이므로 `OrchestratorModule.imports: [ClientsModule]` + `McpModule.imports: [ClientsModule]` 로 명시도 가능.
- **L8-9 providers === exports** — 표준 패턴.

**짚어볼 점 / Watch-outs**
- 별 다른 위험 없음.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: 간결.
- 위험 / Risks: 없음.
- 개선 권고 / Recommendations: (1) `@Global` 제거 + 명시적 imports.
- 재읽기 권고 레벨 / Suggested re-read level: 0.
