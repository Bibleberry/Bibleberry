import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const CONNECTED_FLAGS = {
  VITE_ENABLE_MONTH_SCREEN: 'true',
  VITE_ENABLE_HISTORICAL_LIBRARY: 'true',
  VITE_ENABLE_HUB_CONTINUE: 'true',
  VITE_ENABLE_RELEASE_GATEWAY_SOURCE: 'true',
} as const;

export async function buildConnectedReader(outDir: string): Promise<void> {
  // Vite must neither inherit ambient app flags/gateway origins nor load .env files.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')));
  try {
    await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '--eval', `
        import { build } from 'vite';
        await build({
          mode: 'production',
          envFile: false,
          build: { outDir: process.argv[1], emptyOutDir: true },
        });
      `, outDir],
      { env: { ...env, ...CONNECTED_FLAGS, NODE_ENV: 'production' } },
    );
  } catch (error) {
    const details = error as { stderr?: string; message?: string };
    throw new Error(`Connected production build failed: ${details.stderr || details.message}`, { cause: error });
  }
}
