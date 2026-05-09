import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { _electron as electron, expect, Page, test } from "@playwright/test";
import { getNewestQuasarDialog } from "../locators";
import { startUpdateTestServer as startUpdateTestHttpServer } from "../../../tools/update-test-server";
import {
  UPDATE_TEST_VERSION,
  getInstallerFileName,
} from "@/domain/updateDownload";

const execFileAsync = promisify(execFile);
const updateTestPort = 18080;
const updateTestUrl = `http://127.0.0.1:${updateTestPort}`;

/** update-test-server が HTTP で応答するまで待つ上限時間 (ms) */
const UPDATE_SERVER_STARTUP_TIMEOUT_MS = 30000;
/** update-test-server の起動待ちポーリング間隔 (ms) */
const UPDATE_SERVER_POLL_INTERVAL_MS = 500;
/** updater E2E 全体のタイムアウト時間 (ms) */
const UPDATE_E2E_TIMEOUT_MS = 20 * 60 * 1000;
/** 初回起動ダイアログまたは更新通知ダイアログを待つ上限時間 (ms) */
const INITIAL_OR_UPDATE_DIALOG_TIMEOUT_MS = 120 * 1000;

type PackagedAppLaunchEnvironment = {
  env: Record<string, string>;
  downloadsDirectory: string;
};

test.describe.configure({ mode: "serial" });

/**
 * build.yml の zip artifact から展開されたアプリケーションの実行ファイルパスを取得する。
 * @returns Electron アプリケーションの実行ファイルパス
 */
function getAppExecutablePath(): string {
  const appDirectoryPath = path.resolve("AivisSpeech");

  if (process.platform === "win32") {
    return path.join(appDirectoryPath, "AivisSpeech.exe");
  }

  if (process.platform === "darwin") {
    return path.join(
      appDirectoryPath,
      "AivisSpeech.app",
      "Contents",
      "MacOS",
      "AivisSpeech",
    );
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * 現在の OS / CPU に対応する updater のインストーラーファイル名を取得する。
 * @returns テストサーバーからダウンロードされるインストーラーファイル名
 */
function getExpectedInstallerFileName(): string {
  if (process.platform === "win32") {
    return getInstallerFileName("windows-x64", UPDATE_TEST_VERSION);
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return getInstallerFileName("macos-x64", UPDATE_TEST_VERSION);
  }

  if (process.platform === "darwin" && process.arch === "arm64") {
    return getInstallerFileName("macos-arm64", UPDATE_TEST_VERSION);
  }

  throw new Error(
    `Unsupported platform for updater E2E. platform: ${process.platform}, arch: ${process.arch}`,
  );
}

/**
 * Electron 起動時に渡せるよう、未定義値を含まない環境変数を生成する。
 * @returns Playwright の electron.launch() に渡せる環境変数
 */
function createElectronLaunchEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return entry[1] != null;
    }),
  );
}

/**
 * packaged app を E2E テスト用のユーザーデータ領域で起動する環境変数を生成する。
 * @returns Electron 起動時に渡す環境変数と、アプリから見える Downloads ディレクトリ
 */
async function createPackagedAppLaunchEnvironment(): Promise<PackagedAppLaunchEnvironment> {
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aivisspeech-updater-e2e-"),
  );
  const env = createElectronLaunchEnv();
  env.AIVISSPEECH_UPDATE_TEST_URL = updateTestUrl;

  if (process.platform === "win32") {
    const appDataDirectory = path.join(tempDirectory, "AppData", "Roaming");
    await fs.mkdir(appDataDirectory, { recursive: true });
    env.APPDATA = appDataDirectory;

    return {
      env,
      downloadsDirectory: path.join(os.homedir(), "Downloads"),
    };
  }

  if (process.platform === "darwin") {
    const homeDirectory = path.join(tempDirectory, "home");
    const downloadsDirectory = path.join(homeDirectory, "Downloads");
    await fs.mkdir(downloadsDirectory, { recursive: true });
    env.HOME = homeDirectory;

    return {
      env,
      downloadsDirectory,
    };
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * updater テストサーバーを起動し、HTTP 応答できるまで待機する。
 * @returns テスト終了時に呼び出す cleanup 関数
 */
async function startUpdateTestServer(): Promise<() => Promise<void>> {
  const server = await startUpdateTestHttpServer({
    port: updateTestPort,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < UPDATE_SERVER_STARTUP_TIMEOUT_MS) {
    const response = await fetch(`${updateTestUrl}/updateInfos.json`).catch(
      () => undefined,
    );
    if (response?.ok === true) {
      return async () => {
        await closeServer(server);
      };
    }
    await new Promise((resolve) =>
      setTimeout(resolve, UPDATE_SERVER_POLL_INTERVAL_MS),
    );
  }

  await closeServer(server);
  throw new Error(
    `Failed to start update test server within ${UPDATE_SERVER_STARTUP_TIMEOUT_MS}ms.`,
  );
}

/**
 * HTTP サーバーを停止する。
 * @param server 停止する HTTP サーバー
 */
async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error != null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * 初回起動時の確認ダイアログが表示された場合だけ閉じる。
 * @param page Electron のメインウィンドウ
 */
async function completeInitialDialogsIfNeeded(page: Page): Promise<void> {
  const firstDialog = await Promise.race([
    page
      .getByText("利用規約に関するお知らせ")
      .waitFor({
        state: "visible",
        timeout: INITIAL_OR_UPDATE_DIALOG_TIMEOUT_MS,
      })
      .then(() => "terms" as const),
    page
      .getByText("アップデートがあります")
      .waitFor({
        state: "visible",
        timeout: INITIAL_OR_UPDATE_DIALOG_TIMEOUT_MS,
      })
      .then(() => "update" as const),
  ]);

  if (firstDialog === "update") {
    return;
  }

  await page.getByRole("button", { name: "同意して使用開始" }).click();
  await page.getByRole("button", { name: "完了" }).click();
  await page.getByRole("button", { name: "許可" }).click();
}

/**
 * Windows インストーラーのプロセス出現を待機してから終了する。
 * @param installerFileName インストーラーのファイル名
 */
async function waitAndKillWindowsInstaller(
  installerFileName: string,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const taskListResult = await execFileAsync("tasklist", [
      "/FI",
      `IMAGENAME eq ${installerFileName}`,
    ]).catch(() => undefined);

    if (taskListResult?.stdout.includes(installerFileName) === true) {
      await execFileAsync("taskkill", [
        "/F",
        "/T",
        "/IM",
        installerFileName,
      ]).catch(() => undefined);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Failed to detect installer process: ${installerFileName}`);
}

/**
 * macOS の DMG マウントを待機してから detach する。
 */
async function waitAndDetachMacDmg(): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const hdiutilResult = await execFileAsync("hdiutil", ["info"]).catch(
      () => undefined,
    );

    if (hdiutilResult?.stdout.includes("/Volumes/AivisSpeech") === true) {
      await execFileAsync("hdiutil", ["detach", "/Volumes/AivisSpeech"]).catch(
        () => undefined,
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Failed to detect mounted AivisSpeech DMG.");
}

test("packaged app で更新通知から実インストーラー起動まで動作する", async () => {
  test.setTimeout(UPDATE_E2E_TIMEOUT_MS);

  const stopUpdateTestServer = await startUpdateTestServer();
  const packagedAppLaunchEnvironment =
    await createPackagedAppLaunchEnvironment();
  const expectedInstallerFileName = getExpectedInstallerFileName();
  const expectedInstallerPath = path.join(
    packagedAppLaunchEnvironment.downloadsDirectory,
    expectedInstallerFileName,
  );
  const downloadStartedAt = Date.now();

  try {
    const app = await electron.launch({
      executablePath: getAppExecutablePath(),
      cwd: path.dirname(getAppExecutablePath()),
      env: packagedAppLaunchEnvironment.env,
      // CI 環境ではタイムアウト時間を長めに設定
      timeout: process.env.CI ? 5 * 60 * 1000 : 60 * 1000,
    });

    app.on("console", (message) => {
      console.log(message.text());
    });

    const page = await app.firstWindow({
      // CI 環境ではタイムアウト時間を長めに設定
      timeout: process.env.CI ? 120 * 1000 : 60 * 1000,
    });
    await completeInitialDialogsIfNeeded(page);

    const dialog = getNewestQuasarDialog(page);
    await expect(dialog.getByText("アップデートがあります")).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "アップデート" }).click();

    await expect(
      dialog.getByRole("button", {
        name:
          process.platform === "darwin"
            ? "インストーラーを開く"
            : "インストールして再起動",
      }),
    ).toBeVisible({
      timeout: 15 * 60 * 1000,
    });

    const installerStat = await fs.stat(expectedInstallerPath);
    expect(installerStat.size).toBeGreaterThan(0);
    expect(installerStat.mtimeMs).toBeGreaterThanOrEqual(downloadStartedAt);

    await dialog
      .getByRole("button", {
        name:
          process.platform === "darwin"
            ? "インストーラーを開く"
            : "インストールして再起動",
      })
      .click();

    // Windows は「インストールして再起動」でインストーラーに制御が移り、アプリ側は既に終了していることがある
    // その場合 app.close() は例外になり得るため無視する
    if (process.platform === "win32") {
      await waitAndKillWindowsInstaller(expectedInstallerFileName);
      await app.close().catch(() => undefined);
      return;
    }

    // macOS はインストーラー起動後も Electron アプリが生存する想定なので、例外を握りつぶさず通常どおり close する
    if (process.platform === "darwin") {
      await waitAndDetachMacDmg();
      await app.close();
      return;
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
  } finally {
    await stopUpdateTestServer();
  }
});
