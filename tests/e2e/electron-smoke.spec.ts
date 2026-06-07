import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
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

  const firstWindow = await app.firstWindow({ timeout: 60_000 });
  if ((await firstWindow.title()).toLowerCase() === 'keepdir') {
    return firstWindow;
  }

  await firstWindow.waitForLoadState('domcontentloaded');
  return firstWindow;
}

async function launchApp(
  tempHome: string,
  overrides: Record<string, string> = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const launchedApp = await electron.launch({
    cwd: appRoot,
    args: ['.'],
    env: safeEnv({
      APPDATA: tempHome,
      HOME: tempHome,
      KEEPDIR_E2E: '1',
      NODE_ENV: 'development',
      ...overrides,
    }),
  });

  return {
    app: launchedApp,
    page: await findMainWindow(launchedApp),
  };
}

function recentFolderButton(page: Page) {
  return page.getByRole('button', { name: /persisted-project/ }).first();
}

function recentFoldersHeading(page: Page) {
  return page.getByRole('heading', { name: 'RECENT FOLDERS' });
}

function customSectionHeading(page: Page, sectionName: string) {
  return page.getByRole('heading', { name: sectionName.toUpperCase() });
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
    const launched = await launchApp(tempHome);
    app = launched.app;
    const { page } = launched;

    await expect(page).toHaveTitle(/keepdir/i);
    await expect(page.getByText('WORKSPACES')).toBeVisible();
    await expect(page.getByText('Select Directory')).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(2);
  });

  test('persists a selected folder and custom sidebar section across restart', async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'keepdir-e2e-'));
    const selectedDirectory = path.join(tempHome, 'persisted-project');
    const sectionName = 'E2E Persisted Section';
    await mkdir(selectedDirectory, { recursive: true });
    await writeFile(path.join(selectedDirectory, 'example.txt'), 'keepdir e2e');

    let launched = await launchApp(tempHome, {
      KEEPDIR_E2E_SELECT_DIRECTORY: selectedDirectory,
    });
    app = launched.app;
    let page = launched.page;

    await expect(page.getByText('WORKSPACES')).toBeVisible();
    await page.getByRole('button', { name: 'Select Directory' }).click();
    await expect(page.getByText('example.txt')).toBeVisible();
    await expect(recentFoldersHeading(page)).toBeVisible();
    await expect(recentFolderButton(page)).toBeVisible();

    await page.getByText('Settings').click();
    const settingsDialog = page.getByRole('dialog');
    await expect(settingsDialog.getByText('Settings')).toBeVisible();
    await settingsDialog.getByText('Custom Sections').click();
    await settingsDialog.getByLabel('Section Name').fill(sectionName);
    await settingsDialog.getByRole('button', { name: 'Create' }).click();
    await expect(
      settingsDialog.getByText('Custom section created successfully')
    ).toBeVisible();
    await settingsDialog.getByRole('button', { name: 'close' }).click();
    await expect(customSectionHeading(page, sectionName)).toBeVisible();

    await page.waitForTimeout(1_000);
    await app.close();
    app = null;

    launched = await launchApp(tempHome, {
      KEEPDIR_E2E_SELECT_DIRECTORY: selectedDirectory,
    });
    app = launched.app;
    page = launched.page;

    await expect(page).toHaveTitle(/keepdir/i);
    await expect(recentFoldersHeading(page)).toBeVisible();
    await expect(recentFolderButton(page)).toBeVisible();
    await expect(customSectionHeading(page, sectionName)).toBeVisible();
  });

  test('queues and applies a watched-folder rename suggestion', async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'keepdir-e2e-'));
    const watchedDirectory = path.join(tempHome, 'watched-inbox');
    await mkdir(watchedDirectory, { recursive: true });

    const launched = await launchApp(tempHome, {
      KEEPDIR_E2E_SELECT_DIRECTORY: watchedDirectory,
      KEEPDIR_E2E_WATCH_RENAME_STUB: '1',
    });
    app = launched.app;
    const { page } = launched;

    await expect(page.getByText('WORKSPACES')).toBeVisible();
    await page.getByText('Settings').click();
    const settingsDialog = page.getByRole('dialog');
    await settingsDialog.getByText('Watch Folders').click();
    await settingsDialog.getByRole('button', { name: /add watched folder/i }).click();
    await expect(settingsDialog.getByText(watchedDirectory)).toBeVisible();
    await settingsDialog.getByRole('button', { name: 'close' }).click();

    await writeFile(path.join(watchedDirectory, 'scan.txt'), 'watched file');

    await page.getByRole('button', { name: /open watched rename queue/i }).click();
    const queueDialog = page.getByRole('dialog');
    await expect(queueDialog.getByText('scan.txt -> organized-scan.txt')).toBeVisible({ timeout: 20_000 });
    await queueDialog.getByRole('checkbox', { name: /select scan.txt/i }).check();
    await queueDialog.getByRole('button', { name: /apply selected/i }).click();

    await expect.poll(async () => readdir(watchedDirectory)).toContain('organized-scan.txt');
  });
});
