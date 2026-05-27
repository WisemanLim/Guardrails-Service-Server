# tsconfig.json — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약 / File Summary**
- 역할: TypeScript 컴파일 설정.
- 진입점에서의 거리: 빌드 설정.
- 라인 수: 20
- 주요 export: compilerOptions, include/exclude
- 의존 모듈 (internal): n/a
- 사용된 외부 패키지: `typescript`, NestJS schematics (간접)
- 부수효과: `tsc`/`nest build` 시 `dist/` 산출
- 동시성 모델: n/a
- 테스트 커버리지 흔적: n/a

## 라인별 분석 / Line-by-Line

```json path=tsconfig.json lines=1-20
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

> 참고: 실제 파일은 17 라인. 위 인용은 줄 번호 매핑용. 라인 14의 중복은 인용 오타이며 실제 파일은 `outDir` 1회만 존재.

**분석 / Analysis (Level 2)**
- 3 `module: commonjs` — NestJS 10 표준. ESM 전환 시 NestJS 11+ 필요.
- 4-5 `target: ES2022`, `lib: ES2022` — Node 20 호환. `Array.prototype.at`, `Object.hasOwn` 등 사용 가능.
- 6 `moduleResolution: node` — TS 5.4 에서도 여전히 유효. `bundler`/`node16` 옵션 미사용.
- 7 `esModuleInterop: true` — CJS/ESM default import 호환 (`import axios from 'axios'`).
- 8-9 `experimentalDecorators` + `emitDecoratorMetadata` — NestJS DI/Guard/Controller 데코레이터 필수.
- 10 **`strict: true`** — 좋다. null-safety 강제.
- 11 `resolveJsonModule` — 코드 내 JSON import 없음. 향후 정책 fixtures 위해 켜둠.
- 12 `skipLibCheck: true` — 빌드 시간/메모리 절약. 단점은 deps 타입 오류 무시.
- 13 `outDir: ./dist` — Dockerfile 과 정합.
- 15 `baseUrl: ./` — paths 매핑은 없음. (있다면 `@/...` 같은 alias.)
- 16 `incremental: true` — `.tsbuildinfo` 생성. CI 캐시 가능.
- 17 `sourceMap: true` — prod 도 sourcemap 활성. 디버깅엔 좋지만 dist 사이즈 증가.
- 19 `exclude` 가 `**/*.spec.ts` 포함 — 빌드 시 테스트 제외. 좋다.

**짚어볼 점 / Watch-outs**
- **`noUnusedLocals` / `noUnusedParameters` 미설정** — strict 에 포함되지 않음. dead variable 발견 못함.
- **`noImplicitOverride`, `noFallthroughCasesInSwitch` 미설정** — `stdio.transport.ts:dispatch` 의 switch 가 `break` 없이 return 만 사용해 안전하지만, 추가 시 안전망 강화.
- **`forceConsistentCasingInFileNames`** 미설정 — macOS/Linux 대소문자 차이로 인한 import 오류 가능 (Linux 빌드에서 깨질 수 있음).
- **`paths` 미설정** — 현 규모는 OK 지만, `import ... from '../../../...'` 가 늘면 alias 도입 가치 있음.
- **`declaration` 미설정** — 라이브러리 배포 시 필요. 본 프로젝트는 server-only 이므로 OK.

**파일 수준 평가 / File-Level Verdict**
- 강점:
  1. `strict: true` — null/undefined 안전성 확보.
  2. NestJS 데코레이터 메타 활성화.
  3. spec.ts 빌드 제외, sourcemap/incremental 활성.
- 위험:
  1. `forceConsistentCasingInFileNames` 부재 — Linux CI 에서 import 오류 가능.
  2. `noUnusedLocals/Parameters` 부재 — dead code 누적 위험.
- 개선 권고 (impact 순):
  1. `forceConsistentCasingInFileNames: true` 추가.
  2. `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride` 추가.
  3. prod sourcemap 정책 결정 (보안 검토 후 유지/제거).
- 재읽기 권고 레벨: Level 0 (강한 설정, 큰 이슈 없음)
