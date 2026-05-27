# src/mcp/mcp.module.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: `McpController` + `ToolRegistryService` 모듈 컴포지션.
- 진입점에서의 거리 / Distance from entrypoint: 1.
- 라인 수 / LOC: 11.
- 주요 export / Exports: `class McpModule`.
- 의존 모듈 / Depends on (internal): `./mcp.controller`, `./tool-registry.service`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`.

---

```ts path=src/mcp/mcp.module.ts lines=1-11
import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  controllers: [McpController],
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class McpModule {}
```

**분석 / Analysis (Level 2)**

- **L5-9** — `controllers` (HTTP route 등록) + `providers` (DI). `exports: [ToolRegistryService]` 가 흥미로움 — `stdio.transport.ts` 가 `NestFactory.createApplicationContext(AppModule)` 후 `ctx.get(ToolRegistryService)` 로 접근한다. Nest 의 application context 는 글로벌 모듈/exports 를 통해 provider 를 lookup 한다. `McpModule` 자체는 `@Global` 이 아니지만 `AppModule.imports: [McpModule]` 이므로 lookup 가능.
- 비-Global 인데도 `stdio.transport.ts` 에서 ctx.get 이 동작하는 이유: `ctx.get(ProviderClass)` 는 기본적으로 같은 모듈 트리 전체 검색.

**짚어볼 점 / Watch-outs**
- 별 다른 위험 없음.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) `@Global` 미사용 — 깔끔.
- 위험 / Risks: 없음.
- 개선 권고 / Recommendations: 없음.
- 재읽기 권고 레벨 / Suggested re-read level: 0.
