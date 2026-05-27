# src/auth/auth.module.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: `ApiKeyGuard` 를 글로벌 provider 로 노출.
- 진입점에서의 거리 / Distance from entrypoint: 2.
- 라인 수 / LOC: 7.
- 주요 export / Exports: `class AuthModule`.
- 의존 모듈 / Depends on (internal): `./api-key.guard`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`.
- 부수효과 / Side effects: 없음.
- 동시성 모델 / Concurrency model: n/a.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/auth/auth.module.ts lines=1-7
import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

@Global()
@Module({ providers: [ApiKeyGuard], exports: [ApiKeyGuard] })
export class AuthModule {}
```

**분석 / Analysis (Level 2)**

- **L4 `@Global()`** — 어느 모듈에서든 `@UseGuards(ApiKeyGuard)` 사용 가능. 본 프로젝트는 사실 `McpController` 한 군데서만 쓰므로 글로벌 필요는 없다. 향후 controller 가 늘면 편리하지만, “이 import 가 어디서 왔지?” 추적성이 떨어지는 트레이드오프.
- **L5 `providers: [ApiKeyGuard], exports: [ApiKeyGuard]`** — provider 와 export 가 동일. Global 인 경우 export 가 사실상 무관(Global 은 자동 노출). 그러나 명시는 의도 표현으로 가치 있다.

**짚어볼 점 / Watch-outs**
- `@Global` 남용 — 의존성 가시성 저하.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 의도가 분명. (2) provider/export 명시.
- 위험 / Risks: 거의 없음.
- 개선 권고 / Recommendations: (1) 컨트롤러가 단일이라면 `@Global()` 제거하고 `McpModule.imports: [AuthModule]` 로 명시화.
- 재읽기 권고 레벨 / Suggested re-read level: 0.
