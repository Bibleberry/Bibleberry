import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import * as path from 'node:path';

const HOST = '127.0.0.1';

export type StartedPreviewServer = {
  server: ChildProcess;
  baseUrl: string;
  port: number;
};

async function findFreePort(preferredPort?: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', error => {
      if (preferredPort !== undefined) {
        reject(error);
      } else {
        reject(error);
      }
    });
    probe.listen(preferredPort ?? 0, HOST, () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not resolve preview port')));
        return;
      }
      const { port } = address;
      probe.close(closeError => (closeError ? reject(closeError) : resolve(port)));
    });
  });
}

async function waitForServer(server: ChildProcess, baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Preview server exited before becoming ready (${server.exitCode})`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview server may need a moment to bind its port.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Preview server did not become ready at ${baseUrl}`);
}

export async function startPreviewServer(options?: {
  port?: number;
  outDir?: string;
}): Promise<StartedPreviewServer> {
  const port = await findFreePort(options?.port);
  const baseUrl = `http://${HOST}:${port}`;
  const viteCli = path.resolve('node_modules/vite/bin/vite.js');
  const args = [
    viteCli,
    'preview',
    '--host',
    HOST,
    '--port',
    String(port),
    '--strictPort',
  ];
  if (options?.outDir) {
    args.push('--outDir', options.outDir);
  }
  const server = spawn(process.execPath, args, { stdio: 'ignore' });
  try {
    await waitForServer(server, baseUrl);
  } catch (error) {
    await stopPreviewServer(server);
    throw error;
  }
  return { server, baseUrl, port };
}

export async function stopPreviewServer(server: ChildProcess | undefined): Promise<void> {
  if (!server) return;
  if (server.exitCode !== null || server.signalCode !== null) return;

  server.kill('SIGTERM');
  const exitedGracefully = await new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), 2_000);
    server.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  if (!exitedGracefully && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL');
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 1_000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
