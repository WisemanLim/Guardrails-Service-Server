# src/app.module.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: NestJS 루트 모듈 — 5개 feature 모듈 import + HealthController 등록.
- 진입점에서의 거리 / Distance from entrypoint: 1 (main.ts 에서 import).
- 라인 수 / LOC: 19.
- 주요 export / Exports: `class AppModule`.
- 의존 모듈 / Depends on (internal): `health/health.controller`, `mcp/mcp.module`, `clients/clients.module`, `orchestrator/orchestrator.module`, `auth/auth.module`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`, `@nestjs/config`.
- 부수효과 / Side effects: 없음 (선언적).
- 동시성 모델 / Concurrency model: n/a.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/app.module.ts lines=1-19
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { McpModule } from './mcp/mcp.module';
import { ClientsModule } from './clients/clients.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ClientsModule,
    OrchestratorModule,
    McpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

**분석 / Analysis (Level 2)**

- **L1-7 imports** — 각 feature module 을 한 곳에서 가져온다. 순환 의존을 만들 위험은 낮다 (각 feature 가 `AppModule` 을 import 하지 않음).
- **L11 `ConfigModule.forRoot({ isGlobal: true })`** — `.env` 자동 로드 + `ConfigService` 를 글로벌 provider 로 노출. 다만 본 프로젝트는 `ConfigService.get()` 을 쓰지 않고 `config/runtime.ts` 가 `process.env` 를 직접 읽으므로, 실질적인 효과는 “`@nestjs/config` 가 `dotenv` 를 호출해 `.env` 를 `process.env` 에 머지” 정도. 만약 `runtime.ts` 가 `import` 되는 시점이 `forRoot` 호출보다 *전* 이라면(자바스크립트 모듈 평가 순서: import 가 어느 곳에 있든 위에서 아래로) `.env` 값은 반영되지 않을 수 있다. 흔한 실수: NestJS 모범 사례는 정적 상수 대신 `ConfigService` 사용.
- **L12-15 모듈 순서** — Nest 가 의존 그래프를 분석해 인스턴스화하므로 순서 자체는 동작에 영향 없다. 다만 `AuthModule` 을 맨 앞에 둔 것은 의도된 문서적 표현(인증 먼저).
- **L17 `controllers: [HealthController]`** — 라우트 `/health` 가 가드 없이 노출 (보안 의도: liveness probe 용). 다른 컨트롤러(`McpController`) 는 `McpModule` 안에 있음.
- **L19 빈 클래스** — Nest 데코레이터 메타데이터 컨테이너 역할.

**짚어볼 점 / Watch-outs**
- ConfigModule 만 import 했지만 `ConfigService` 사용 안 함 → 실효성 절반.
- `HealthController` 는 보호받지 않음(의도). 그러나 응답 본문에 다운스트림 URL 이 노출 (health.controller.ts 참조) — 내부 망 가정.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 작고 명확. (2) Global 모듈 분리로 controller 가 깔끔.
- 위험 / Risks: (1) ConfigModule + Runtime 정적 상수의 평가 순서 충돌 가능성.
- 개선 권고 / Recommendations: (1) `ConfigModule.forRoot({ load: [runtimeFactory], validationSchema: ... })` 로 일원화. (2) `HealthController` 응답 본문에서 다운스트림 URL 노출은 PRD 가 허용한다면 유지, 그렇지 않다면 제거.
- 재읽기 권고 레벨 / Suggested re-read level: 1.
