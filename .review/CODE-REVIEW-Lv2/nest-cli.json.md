# nest-cli.json — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약 / File Summary**
- 역할: NestJS CLI 설정 (`nest build`, `nest start`).
- 진입점에서의 거리: 빌드 도구, 런타임 코드 아님.
- 라인 수: 6
- 주요 export: JSON 설정
- 의존 모듈 (internal): 없음
- 사용된 외부 패키지: `@nestjs/cli`, `@nestjs/schematics` (devDeps)
- 부수효과: `nest build` 호출 시 `dist/` 삭제 후 재생성
- 동시성 모델: n/a
- 테스트 커버리지 흔적: n/a

## 라인별 분석 / Line-by-Line

```json path=nest-cli.json lines=1-6
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

**분석 / Analysis (Level 2)**
- 2: `$schema` 명시 — 에디터 자동완성 + 검증. 좋은 습관.
- 3: `collection` — `nest generate` 시 사용할 schematic. 기본값.
- 4: `sourceRoot: src` — `tsconfig.json:include` 와 일치.
- 5: `deleteOutDir: true` — `nest build` 시 `dist/` 비우고 시작. CI 빌드에 안전.

**짚어볼 점 / Watch-outs**
- `assets`/`watchAssets` 설정 없음 — 비-TS 리소스 (예: 정책 JSON 템플릿) 가 들어오면 누락된다. 현재는 그런 리소스 없음.
- `monorepo` 모드 아님 — 단일 패키지. OK.
- `webpack: true` 옵션 미사용 — bundling 으로 cold start 시간 줄일 여지 있음. 현 운영 부담 감안하면 over-engineering.

**파일 수준 평가 / File-Level Verdict**
- 강점:
  1. 최소 설정. 표준에 충실.
  2. `$schema` 로 IDE 검증.
- 위험:
  1. `assets` 부재 — 비-TS 리소스 추가 시 누락 위험.
- 개선 권고:
  1. 현 시점 변경 불필요. 정책 템플릿/static asset 추가 시 `assets` 항목 도입.
- 재읽기 권고 레벨: Level 0 (재방문 불필요)
