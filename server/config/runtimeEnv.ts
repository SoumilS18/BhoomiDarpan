/**
 * Detects whether the current process is the automated test harness.
 *
 * Why this exists as its own module
 * ---------------------------------
 * `bun test`, the dev server and the production server all read the SAME
 * `.env`, so the Supabase service-role credentials are available to all three.
 * Any code path that writes to Supabase therefore has to ask this question
 * first: otherwise a test run executes real writes against the live project.
 *
 * That is not theoretical. A mocked `executeAuthoritativeLgdSync` (2 fixture
 * states, no network) wrote `status = 'operational'` plus a `last_sync` summary
 * into the production `data_sources` row for `lgd_india`, while
 * `administrative_units` stayed empty — a recorded claim of authoritative
 * LGD data that did not exist.
 *
 * `bun test` sets `NODE_ENV=test`; the dev and production servers do not, so
 * this is a reliable discriminator.
 */
export function isTestEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.BUN_ENV === 'test' ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.JEST_WORKER_ID)
  );
}
