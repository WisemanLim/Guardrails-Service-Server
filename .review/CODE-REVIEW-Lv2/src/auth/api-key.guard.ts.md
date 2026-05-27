# src/auth/api-key.guard.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: HTTP 요청의 `x-api-key` 헤더가 `Runtime.apiKey` 와 일치하는지 검사.
- 진입점에서의 거리 / Distance from entrypoint: 2 (controller 가 `@UseGuards`).
- 라인 수 / LOC: 22.
- 주요 export / Exports: `class ApiKeyGuard implements CanActivate`.
- 의존 모듈 / Depends on (internal): `../config/runtime`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`, `express` (type).
- 부수효과 / Side effects: throw `UnauthorizedException` (HTTP 401).
- 동시성 모델 / Concurrency model: 동기 함수.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/auth/api-key.guard.ts lines=1-22
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Runtime } from '../config/runtime';

/**
 * Trivial API-key check for the HTTP transport. Stdio bypasses this since
 * the channel itself is OS-permission scoped.
 *
 * In production, replace with OAuth client-credentials + key rotation.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = (req.headers['x-api-key'] as string) ?? '';
    if (provided !== Runtime.apiKey) {
      throw new UnauthorizedException('invalid_api_key');
    }
    return true;
  }
}
```

**분석 / Analysis (Level 2)**

- **L1 imports** — `CanActivate` 와 `ExecutionContext` 는 Nest 의 가드 추상화. `UnauthorizedException` 은 401 응답으로 매핑된다.
- **L2 `import type { Request }`** — `import type` 라 컴파일 후 자취 없음(runtime cost 0).
- **L11 `@Injectable()`** — DI 컨테이너 등록 데코레이터. `AuthModule.providers` 에 선언되어 있다.
- **L13 `canActivate(ctx): boolean`** — 동기. async/await 미사용. 즉시 throw 패턴.
- **L14 `ctx.switchToHttp().getRequest<Request>()`** — Nest 의 transport-agnostic 추상화: HTTP 컨텍스트로 좁히고 Express Request 로 타입 단언. 비-HTTP transport(stdio) 에서 controller 를 거치지 않으므로 이 가드는 호출되지 않는다.
- **L15 `req.headers['x-api-key'] as string`** — Express 가 헤더를 lowercase 로 정규화한다(`X-API-Key`, `x-api-key` 모두 매치). `string | string[] | undefined` 가 실제 타입인데 `as string` 단언이라 배열로 오면 `provided` 가 `'a,b'` 같은 문자열로 자동 변환되지 않고 그대로 배열로 남는다 → `!== Runtime.apiKey` 는 항상 truthy → 401. 안전한 방향이지만 명시적 처리가 더 정직.
- **L15 `?? ''`** — undefined 시 빈 문자열로 fallback. 그러면 빈 문자열 `provided` 와 (default 인 경우라도) 비교가 일관.
- **L16 `provided !== Runtime.apiKey`** — **timing attack** 노출. 자바스크립트의 `!==` 문자열 비교는 일치할 때까지 byte-wise 일 가능성이 있어(엔진 구현 의존) micro-timing 으로 key prefix 를 추측당할 수 있다. `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(Runtime.apiKey))` (선행 길이 체크 후) 가 정석.
- **L17 `UnauthorizedException('invalid_api_key')`** — 메시지를 노출. 외부에 “invalid_api_key” 라는 코드만 떨어져 정보 누출이 적다. OK.
- **L19 `return true`** — 통과. 가드는 boolean 반환 또는 throw 로만 의사 표현.

**짚어볼 점 / Watch-outs**
- **Security: timing-safe 비교 부재.**
- **Security: 단일 평문 키만 지원** — 로테이션/다중 키/스코프 없음.
- **Header 케이스**: Express 정규화에 의존. 다른 어댑터(Fastify 등) 로 바꿀 때 깨질 수 있음 — 본 프로젝트는 express 고정이라 OK.
- **`as string` 단언**: 배열 헤더(클라가 두 번 보냄) 시 의도와 다르게 동작 가능. 매우 드문 케이스.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 명확한 단일 책임. (2) stdio bypass 의도가 주석으로 분명.
- 위험 / Risks: (1) 평문/non-timing-safe 비교. (2) prod default key 가드 부재(파일 자체가 아닌 runtime.ts).
- 개선 권고 / Recommendations: (1) `timingSafeEqual` 도입. (2) `if (Runtime.apiKey === 'dev-key-please-change' && NODE_ENV === 'production') throw` 같은 부팅 가드 추가 (runtime.ts 측). (3) 가드에 audit hook (실패 시 stderr/audit 비동기 기록).
- 재읽기 권고 레벨 / Suggested re-read level: 3 — 보안 핫스팟, 교체 전까지 반복 확인.
