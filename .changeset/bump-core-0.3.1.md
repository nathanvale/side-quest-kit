---
"@side-quest/kit": patch
---

fix(deps): bump @side-quest/core to ^0.3.1 and fix flaky CI test

- Bump @side-quest/core from ^0.1.1 to ^0.3.1 to pick up the fix for Bun-only `exists` import that breaks in non-Bun environments (side-quest-core#29, side-quest-core#31)
- Remove `pathExistsSync` assertion from `getSemanticCacheDir` test that failed in CI due to mock leakage from `kit-wrapper.test.ts`
