/**
 * Starts the real Express app on an ephemeral port for integration tests.
 *
 * Each Jest worker gets its own server instance, so suites can run in
 * parallel without fighting over port 5000 or requiring the dev server
 * to be running.
 *
 * Usage:
 *   let server: TestServer;
 *   beforeAll(async () => { server = await startTestServer(); });
 *   afterAll(async () => { await server.close(); });
 *   ...fetch(`${server.baseUrl}/api/...`)
 */

import type { Server } from 'http';
import type { AddressInfo } from 'net';
import app from '../../app';

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server: Server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            // fetch() keeps idle keep-alive sockets open, which would
            // otherwise block close() until the keep-alive timeout.
            server.closeIdleConnections();
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on('error', reject);
  });
}
