import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A disposable instance of the REAL API application, on an ephemeral port.
 *
 * Why this exists
 * ---------------
 * Six suites described themselves as "live HTTP" tests but actually addressed
 * `http://127.0.0.1:3001` — the developer's own `bun run dev` server. That
 * made `bun test` depend on an unrelated process being up, made the result
 * depend on whatever code that process happened to be running, and required
 * that server to honour client-chosen role headers.
 *
 * Mounting `createApiApp()` here gives byte-for-byte the same routing,
 * middleware, RBAC and error handling, inside the test process — so the
 * harness is the caller's own environment and role headers mean only what the
 * harness says they mean.
 */
export interface LiveApi {
  /** Base origin, e.g. `http://127.0.0.1:53412`. */
  url: string;
  /** Closes the listener. Safe to call more than once. */
  close: () => Promise<void>;
}

export async function startLiveApi(): Promise<LiveApi> {
  const { createApiApp } = await import('../../server/index');
  const server = http.createServer(createApiApp());

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  let closed = false;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        if (closed) return resolve();
        closed = true;
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
