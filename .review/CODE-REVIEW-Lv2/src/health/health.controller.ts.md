# src/health/health.controller.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: `GET /health` — liveness/configuration probe.
- 진입점에서의 거리 / Distance from entrypoint: 1.
- 라인 수 / LOC: 21.
- 주요 export / Exports: `class HealthController`.
- 의존 모듈 / Depends on (internal): `../config/runtime`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`.
- 부수효과 / Side effects: HTTP 200 응답.
- 동시성 모델 / Concurrency model: 동기.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/health/health.controller.ts lines=1-21
import { Controller, Get } from '@nestjs/common';
import { Runtime } from '../config/runtime';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      transport: Runtime.transport,
      enabledDomains: Runtime.enabledDomains,
      enabledLocales: Runtime.enabledLocales,
      downstream: {
        policy: Runtime.policyEngineUrl,
        detection: Runtime.detectionEngineUrl,
        audit: Runtime.auditServiceUrl,
      },
    };
  }
}
```

**분석 / Analysis (Level 2)**

- **L4 `@Controller('health')` + L6 `@Get()`** — 경로 `/health` (rate-limit 없음, guard 없음).
- **L9-17 응답** — `status: 'ok'` 가 hardcoded. 실제 “downstream readiness” 는 검사하지 않음. 따라서 **liveness probe** 로만 적합. **readiness probe** 로는 부적합(Policy/Detection/Audit 가 다운이어도 ok 응답).
- **L13-16 downstream URL 노출** — 내부 망 가정 시 OK. 외부 노출 시 가벼운 정보 누설(공격자 입장에서 토폴로지 추정).
- `status` 코드 항상 200. 다운스트림이 다운이어도 200 → orchestration platform(k8s 등) 이 잘못된 healthy 신호를 받음.

**짚어볼 점 / Watch-outs**
- `/health` 가 readiness 까지 묶기엔 부족. 별도 `/ready` 가 다운스트림 핑까지 수행하는 게 정석.
- 다운스트림 URL 노출은 내부 망 한정.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 매우 단순. (2) ConfigModule + Runtime 로 캐릭터화된 응답.
- 위험 / Risks: (1) readiness 의미가 약함. (2) URL 노출.
- 개선 권고 / Recommendations: (1) `/healthz` (liveness, 항상 200) + `/readyz` (다운스트림 head ping) 분리. (2) 외부 노출이라면 downstream URL 제거.
- 재읽기 권고 레벨 / Suggested re-read level: 1.
