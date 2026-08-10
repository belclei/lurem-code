// apps/api/vitest.config.ts
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// Integration tests run `resetTestDb` (truncates every table) after every
// single test — pointed at the same DATABASE_URL as `npm run dev`, that
// wipes the real local dev database on every test run, not just a
// disposable test one. `.env.test` (a separate `lurem_test` database, same
// Postgres instance) exists specifically so that never happens again — this
// loads it into `process.env` *before* any test file (and therefore before
// `new PrismaClient()`) runs. Vitest does NOT auto-load `.env.test` the way
// Vite's dev/build pipeline auto-loads mode-specific env files for
// `import.meta.env` — that behavior doesn't extend to `process.env` in the
// node test environment, so this has to be explicit.
const testEnv = loadDotenv({ path: ".env.test" }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    env: testEnv,
    testTimeout: 15000,
    // Integration tests share one real Postgres/Redis instance, and
    // `resetTestDb` truncates the whole DB after every test (not scoped to
    // the calling file) — running test files concurrently lets one file's
    // teardown wipe fixtures another file is mid-test with. Sequential file
    // execution is the correct fix, not a workaround: these are integration
    // tests against shared external state, not pure unit tests.
    //
    // `fileParallelism: false` alone was not enough (found Sprint 10, growing
    // the suite past ~180 tests made the flakiness reproducible): Vitest's
    // default `forks` pool still spawns multiple worker processes and only
    // schedules *files* onto them one at a time, which still let two worker
    // processes hold live connections into the same shared Postgres/Redis
    // concurrently across a file boundary. Pinning to a single fork removes
    // the worker-process boundary entirely — confirmed fixing an
    // intermittent ~15% test failure rate (500s/401s/wrong-array-length,
    // never the same tests twice) that individual per-file runs never showed.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
