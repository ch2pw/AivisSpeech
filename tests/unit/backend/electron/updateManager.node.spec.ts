import fs from "node:fs";
import http, { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { UpdateManager } from "@/backend/electron/updateManager";
import { uuid4 } from "@/helpers/random";

type TestServerHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void;

let tmpDir: string;
// 複数のテストサーバーを同時に起動するケースに対応するため、配列で管理する
const servers: http.Server[] = [];

const startServer = async (handler: TestServerHandler): Promise<string> => {
  const newServer = http.createServer(handler);
  servers.push(newServer);
  await new Promise<void>((resolve) => {
    newServer.listen(0, "127.0.0.1", resolve);
  });

  const address = newServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `aivisspeech-update-${uuid4()}`),
  );
});

afterEach(async () => {
  // 全てのテストサーバーを停止する
  for (const serverInstance of servers) {
    serverInstance.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      serverInstance.close((error) => {
        if (error != undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
  servers.length = 0;

  // テスト用一時ディレクトリの後片付け
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("UpdateManager", () => {
  test("インストーラーを正常にダウンロードして .downloading からリネームできる", async () => {
    const content = Buffer.from("installer content");
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200, {
        "Content-Length": content.length,
      });
      response.end(content);
    });
    const manager = new UpdateManager(() => tmpDir);

    const result = await manager.downloadUpdate({
      url: `${baseUrl}/installer.exe`,
      fileName: "installer.exe",
      onProgress: () => undefined,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(fs.readFileSync(result.value.installerPath)).toEqual(content);
      expect(fs.existsSync(`${result.value.installerPath}.downloading`)).toBe(
        false,
      );
    }
  });

  test("ダウンロードをキャンセルできる", async () => {
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200, {
        "Content-Length": 100,
      });
      response.write("a");
    });
    const manager = new UpdateManager(() => tmpDir);

    const resultPromise = manager.downloadUpdate({
      url: `${baseUrl}/slow-installer.exe`,
      fileName: "slow-installer.exe",
      onProgress: () => {
        manager.cancelDownload();
      },
    });
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("downloadCancelled");
    }
  });

  test("同時ダウンロードの 2 つ目は失敗する", async () => {
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200, {
        "Content-Length": 100,
      });
      response.write("a");
    });
    const manager = new UpdateManager(() => tmpDir);

    const firstResultPromise = manager.downloadUpdate({
      url: `${baseUrl}/first.exe`,
      fileName: "first.exe",
      onProgress: () => undefined,
    });
    const secondResult = await manager.downloadUpdate({
      url: `${baseUrl}/second.exe`,
      fileName: "second.exe",
      onProgress: () => undefined,
    });

    manager.cancelDownload();
    await firstResultPromise;

    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) {
      expect(secondResult.code).toBe("alreadyDownloading");
    }
  });

  test("302 リダイレクトをフォローできる", async () => {
    const content = Buffer.from("redirected content");
    const baseUrl = await startServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, {
          Location: "/installer.exe",
        });
        response.end();
        return;
      }

      response.writeHead(200, {
        "Content-Length": content.length,
      });
      response.end(content);
    });
    // テスト用モックサーバーは HTTP のため、HTTPS 強制を無効化
    const manager = new UpdateManager(() => tmpDir, true);

    const result = await manager.downloadUpdate({
      url: `${baseUrl}/redirect`,
      fileName: "redirect-installer.exe",
      onProgress: () => undefined,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(fs.readFileSync(result.value.installerPath)).toEqual(content);
    }
  });

  test("Content-Length がない場合は totalBytes が 0 で通知される", async () => {
    const content = Buffer.from("content without length");
    const progressValues: { downloadedBytes: number; totalBytes: number }[] = [];
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200);
      response.end(content);
    });
    const manager = new UpdateManager(() => tmpDir);

    const result = await manager.downloadUpdate({
      url: `${baseUrl}/installer.exe`,
      fileName: "no-content-length.exe",
      onProgress: (downloadedBytes, totalBytes) => {
        progressValues.push({ downloadedBytes, totalBytes });
      },
    });

    expect(result.ok).toBe(true);
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues.at(-1)).toEqual({
      downloadedBytes: content.length,
      totalBytes: 0,
    });
  });

  test("fileName が '..' のときはダウンロードを拒否する", async () => {
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200, { "Content-Length": 5 });
      response.end("hello");
    });
    const manager = new UpdateManager(() => tmpDir);

    const result = await manager.downloadUpdate({
      url: `${baseUrl}/installer.exe`,
      fileName: "..",
      onProgress: () => undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalidFileName");
    }
  });

  test("不正な fileName でダウンロードが拒否された後も、正常なダウンロードが可能", async () => {
    const content = Buffer.from("valid content");
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200, { "Content-Length": content.length });
      response.end(content);
    });
    const manager = new UpdateManager(() => tmpDir);

    // 不正な fileName でダウンロード
    const invalidResult = await manager.downloadUpdate({
      url: `${baseUrl}/installer.exe`,
      fileName: "..",
      onProgress: () => undefined,
    });
    expect(invalidResult.ok).toBe(false);

    // その後、正常な fileName でダウンロードできること
    const validResult = await manager.downloadUpdate({
      url: `${baseUrl}/installer.exe`,
      fileName: "installer.exe",
      onProgress: () => undefined,
    });
    expect(validResult.ok).toBe(true);
  });

  test("fileName が空文字列のときはダウンロードを拒否する", async () => {
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200, { "Content-Length": 5 });
      response.end("hello");
    });
    const manager = new UpdateManager(() => tmpDir);

    const result = await manager.downloadUpdate({
      url: `${baseUrl}/installer.exe`,
      fileName: "",
      onProgress: () => undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalidFileName");
    }
  });

  test("HTTPS から HTTP へのリダイレクトは拒否される", async () => {
    const httpUrl = await startServer((_, response) => {
      response.writeHead(200, { "Content-Length": 5 });
      response.end("hello");
    });
    // HTTPS 強制が有効な（デフォルトの）マネージャーでテスト
    const manager = new UpdateManager(() => tmpDir);
    // HTTP リダイレクト先を持つ 302 を直接テストする代わりに、
    // HTTP URL を直接ダウンロードしようとしてもリダイレクト先の HTTPS 検証でブロックされることを確認
    const redirectBaseUrl = await startServer((_, response) => {
      response.writeHead(302, { Location: httpUrl });
      response.end();
    });

    const result = await manager.downloadUpdate({
      url: `${redirectBaseUrl}/redirect`,
      fileName: "installer.exe",
      onProgress: () => undefined,
    });

    expect(result.ok).toBe(false);
  });

  test("進捗コールバックが呼ばれる", async () => {
    const firstChunk = Buffer.from("first");
    const secondChunk = Buffer.from("second");
    const progressValues: { downloadedBytes: number; totalBytes: number }[] = [];
    const baseUrl = await startServer((_, response) => {
      response.writeHead(200, {
        "Content-Length": firstChunk.length + secondChunk.length,
      });
      response.write(firstChunk);
      response.end(secondChunk);
    });
    const manager = new UpdateManager(() => tmpDir);

    const result = await manager.downloadUpdate({
      url: `${baseUrl}/installer.exe`,
      fileName: "progress-installer.exe",
      onProgress: (downloadedBytes, totalBytes) => {
        progressValues.push({ downloadedBytes, totalBytes });
      },
    });

    expect(result.ok).toBe(true);
    expect(progressValues.at(-1)).toEqual({
      downloadedBytes: firstChunk.length + secondChunk.length,
      totalBytes: firstChunk.length + secondChunk.length,
    });
  });
});
