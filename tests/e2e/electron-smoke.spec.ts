import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';

const appRoot = path.resolve(__dirname, '../..');
const devServerUrl = 'http://127.0.0.1:8081';

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function safeEnv(overrides: Record<string, string>) {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      ...overrides,
    }).filter(
      ([key, value]) => key && !key.startsWith('=') && value !== undefined
    )
  ) as Record<string, string>;
}

function waitForHttp(url: string, timeoutMs = 45_000): Promise<boolean> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve(true);
      });

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 500);
      });

      request.setTimeout(2_000, () => {
        request.destroy();
      });
    };

    check();
  });
}

async function findMainWindow(app: ElectronApplication): Promise<Page> {
  const existing = app.windows();
  for (const page of existing) {
    if ((await page.title()).toLowerCase() === 'keepdir') {
      return page;
    }
  }

  const firstWindow = await app.firstWindow();
  if ((await firstWindow.title()).toLowerCase() === 'keepdir') {
    return firstWindow;
  }

  await firstWindow.waitForLoadState('domcontentloaded');
  return firstWindow;
}

test.describe('Electron smoke', () => {
  let devServer: ChildProcessWithoutNullStreams | null = null;
  let app: ElectronApplication | null = null;
  let tempHome: string | null = null;

  test.beforeAll(async () => {
    const alreadyRunning = await waitForHttp(devServerUrl, 1_000);
    if (alreadyRunning) {
      return;
    }

    devServer = spawn(npmCommand(), ['run', 'dev:webpack'], {
      cwd: appRoot,
      env: safeEnv({
        NODE_ENV: 'development',
      }),
      shell: process.platform === 'win32',
      stdio: 'pipe',
    });

    const ready = await waitForHttp(devServerUrl);
    if (!ready) {
      devServer.kill();
      throw new Error('Webpack dev server did not become ready on port 8081.');
    }
  });

  test.afterAll(() => {
    devServer?.kill();
  });

  test.afterEach(async () => {
    await app?.close();
    app = null;

    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
      tempHome = null;
    }
  });

  test('launches the local-first app shell', async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'keepdir-e2e-'));
    app = await electron.launch({
      cwd: appRoot,
      args: ['.'],
      env: safeEnv({
        APPDATA: tempHome,
        HOME: tempHome,
        KEEPDIR_E2E: '1',
        NODE_ENV: 'development',
      }),
    });

    const page = await findMainWindow(app);

    await expect(page).toHaveTitle(/keepdir/i);
    await expect(page.getByText('WORKSPACES')).toBeVisible();
    await expect(page.getByText('Select Directory')).toBeVisible();
    await expect(page.getByText('Selected Model')).toBeVisible();
  });
});
