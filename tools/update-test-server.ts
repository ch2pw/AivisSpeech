import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import process from "node:process";
import { pathToFileURL } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { UPDATE_TEST_VERSION } from "../src/domain/updateDownload.ts";

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name: string;
  prerelease: boolean;
  assets: GitHubReleaseAsset[];
};

type UpdateTestServerContext = {
  repo: string;
  githubApiHeaders: Record<string, string>;
  latestDevReleaseCache: GitHubRelease | undefined;
};

type UpdateTestServerOptions = {
  host?: string;
  port?: number;
  repo?: string;
  githubToken?: string;
};

const defaultHost = "127.0.0.1";
const defaultPort = 18080;
const defaultRepo = "Aivis-Project/AivisSpeech";

/**
 * GitHub Releases API へアクセスするためのヘッダーを生成する。
 * @param githubToken GitHub API 認証に利用する token
 * @returns GitHub Releases API に渡す HTTP ヘッダー
 */
function createGithubApiHeaders(
  githubToken: string | undefined,
): Record<string, string> {
  const githubApiHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AivisSpeech-update-test-server",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (githubToken != null && githubToken !== "") {
    githubApiHeaders.Authorization = `Bearer ${githubToken}`;
  }

  return githubApiHeaders;
}

/**
 * 最新の dev prerelease を GitHub Releases API から取得する。
 * @param context update-test-server の実行コンテキスト
 * @returns 最新の dev prerelease
 */
async function fetchLatestDevRelease(
  context: UpdateTestServerContext,
): Promise<GitHubRelease> {
  if (context.latestDevReleaseCache != null) {
    return context.latestDevReleaseCache;
  }

  const releaseResponse = await fetch(
    `https://api.github.com/repos/${context.repo}/releases`,
    {
      headers: context.githubApiHeaders,
    },
  );
  if (!releaseResponse.ok) {
    throw new Error(
      `Failed to fetch GitHub releases. status: ${releaseResponse.status}, statusText: ${releaseResponse.statusText}`,
    );
  }

  const releases = (await releaseResponse.json()) as GitHubRelease[];
  const latestDevRelease = releases.find((release) => {
    return release.prerelease === true && release.tag_name.endsWith("-dev");
  });

  if (latestDevRelease == null) {
    throw new Error(
      `Failed to find latest dev release. repo: ${context.repo}, releaseCount: ${releases.length}`,
    );
  }

  context.latestDevReleaseCache = latestDevRelease;
  console.log(`Using latest dev release: ${latestDevRelease.tag_name}`);
  return latestDevRelease;
}

/**
 * テスト用に見せるファイル名から、実際の nightly アセットを選択する。
 * @param context update-test-server の実行コンテキスト
 * @param requestedFileName テスト対象アプリから要求されたファイル名
 * @returns 実際に GitHub から取得する release asset
 */
async function resolveReleaseAsset(
  context: UpdateTestServerContext,
  requestedFileName: string,
): Promise<GitHubReleaseAsset> {
  const release = await fetchLatestDevRelease(context);
  const requestedAssetPattern = requestedFileName.replace(
    UPDATE_TEST_VERSION,
    release.tag_name,
  );
  const asset = release.assets.find((releaseAsset) => {
    return releaseAsset.name === requestedAssetPattern;
  });

  if (asset == null) {
    throw new Error(
      `Failed to find release asset. tag: ${release.tag_name}, requestedFileName: ${requestedFileName}, expectedAssetName: ${requestedAssetPattern}, availableAssets: ${release.assets.map((releaseAsset) => releaseAsset.name).join(", ")}`,
    );
  }

  return asset;
}

/**
 * Content-Disposition の filename* 用に RFC 5987 形式で値をエンコードする。
 * @param value エンコードする値
 * @returns RFC 5987 の attr-char として利用できる文字列
 */
function encodeRFC5987ValueChars(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

/**
 * Content-Disposition の filename 用に ASCII のフォールバック名を生成する。
 * @param fileName 元のファイル名
 * @returns HTTP ヘッダーに安全に埋め込める ASCII ファイル名
 */
function sanitizeAsciiFileName(fileName: string): string {
  const sanitizedFileName = Array.from(fileName, (character) => {
    const characterCode = character.codePointAt(0);
    if (
      characterCode == null ||
      characterCode < 0x20 ||
      characterCode === 0x7f ||
      characterCode > 0x7e ||
      character === '"' ||
      character === "\\" ||
      character === "/"
    ) {
      return "_";
    }

    return character;
  }).join("");

  return sanitizedFileName === "" ? "download" : sanitizedFileName;
}

/**
 * ダウンロード用の Content-Disposition ヘッダー値を生成する。
 * @param fileName ダウンロード時に見せるファイル名
 * @returns filename と filename* を含む Content-Disposition ヘッダー値
 */
function createAttachmentContentDisposition(fileName: string): string {
  return [
    "attachment",
    `filename="${sanitizeAsciiFileName(fileName)}"`,
    `filename*=UTF-8''${encodeRFC5987ValueChars(fileName)}`,
  ].join("; ");
}

/**
 * HTTP ハンドラー内で発生した例外を安全に HTTP レスポンスへ反映する。
 * @param response HTTP レスポンス
 * @param error 発生した例外
 */
function respondInternalServerError(
  response: http.ServerResponse,
  error: unknown,
): void {
  console.error(error);

  if (response.headersSent === true) {
    if (response.writableEnded === false) {
      response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (response.writableEnded === true) {
    return;
  }

  response.writeHead(500);
  response.end(String(error));
}

/**
 * updateInfos.json を返す。
 * @param response HTTP レスポンス
 */
function respondUpdateInfos(response: http.ServerResponse): void {
  const updateInfos = [
    {
      version: UPDATE_TEST_VERSION,
      descriptions: [
        "AivisSpeech update test server が返す検証用アップデートです。",
      ],
      contributors: [],
    },
  ];

  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(updateInfos));
}

/**
 * GitHub Releases の実アセットをプロキシする。
 * @param context update-test-server の実行コンテキスト
 * @param requestedFileName テスト対象アプリから要求されたファイル名
 * @param response HTTP レスポンス
 */
async function proxyReleaseAsset(
  context: UpdateTestServerContext,
  requestedFileName: string,
  response: http.ServerResponse,
): Promise<void> {
  const asset = await resolveReleaseAsset(context, requestedFileName);
  console.log(`Proxying release asset: ${asset.name}`);

  const assetResponse = await fetch(asset.browser_download_url, {
    headers:
      context.githubApiHeaders.Authorization == null
        ? undefined
        : { Authorization: context.githubApiHeaders.Authorization },
    redirect: "follow",
  });
  if (!assetResponse.ok || assetResponse.body == null) {
    throw new Error(
      `Failed to download release asset. asset: ${asset.name}, status: ${assetResponse.status}, statusText: ${assetResponse.statusText}`,
    );
  }

  const responseHeaders: http.OutgoingHttpHeaders = {
    "Content-Disposition": createAttachmentContentDisposition(requestedFileName),
    "Content-Type":
      assetResponse.headers.get("content-type") ??
      "application/octet-stream",
  };
  const contentLength = assetResponse.headers.get("content-length");
  if (contentLength != null) {
    responseHeaders["Content-Length"] = contentLength;
  }

  response.writeHead(assetResponse.status, responseHeaders);
  Readable.fromWeb(
    assetResponse.body as unknown as NodeReadableStream<Uint8Array>,
  ).pipe(response);
}

/**
 * updater E2E / 手動検証向けの HTTP サーバーを生成する。
 * @param options update-test-server の起動オプション
 * @returns 起動前の HTTP サーバー
 */
export function createUpdateTestServer(
  options: UpdateTestServerOptions = {},
): http.Server {
  const context: UpdateTestServerContext = {
    repo: options.repo ?? defaultRepo,
    githubApiHeaders: createGithubApiHeaders(
      options.githubToken ?? process.env.GITHUB_TOKEN,
    ),
    latestDevReleaseCache: undefined,
  };

  return http.createServer((request, response) => {
    void (async () => {
      try {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");

        if (request.method !== "GET") {
          response.writeHead(405);
          response.end("Method Not Allowed");
          return;
        }

        if (requestUrl.pathname === "/updateInfos.json") {
          respondUpdateInfos(response);
          return;
        }

        const assetPathPrefix = `/${UPDATE_TEST_VERSION}/`;
        if (requestUrl.pathname.startsWith(assetPathPrefix)) {
          const requestedFileName = decodeURIComponent(
            requestUrl.pathname.slice(assetPathPrefix.length),
          );
          await proxyReleaseAsset(context, requestedFileName, response);
          return;
        }

        response.writeHead(404);
        response.end("Not Found");
      } catch (error) {
        respondInternalServerError(response, error);
      }
    })();
  });
}

/**
 * updater E2E / 手動検証向けの HTTP サーバーを起動する。
 * @param options update-test-server の起動オプション
 * @returns 起動済みの HTTP サーバー
 */
export async function startUpdateTestServer(
  options: UpdateTestServerOptions = {},
): Promise<http.Server> {
  const host = options.host ?? defaultHost;
  const port = options.port ?? defaultPort;
  const server = createUpdateTestServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      console.log(
        `AivisSpeech update test server is listening. url: http://${host}:${port}`,
      );
      resolve();
    });
  });

  return server;
}

/**
 * update-test-server が CLI として直接起動されたかを判定する。
 * @returns CLI として直接起動された場合は true
 */
function isExecutedAsScript(): boolean {
  if (process.argv[1] == null) {
    return false;
  }

  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

/**
 * pnpm run 経由で渡された CLI 引数を yargs で解釈できる形に変換する。
 * @returns update-test-server の CLI 引数
 */
function getCliArguments(): string[] {
  const cliArguments = hideBin(process.argv);
  return cliArguments[0] === "--" ? cliArguments.slice(1) : cliArguments;
}

/**
 * update-test-server を CLI として起動する。
 */
async function startCli(): Promise<void> {
  const argv = await yargs(getCliArguments())
    .option("host", {
      default: defaultHost,
      type: "string",
    })
    .option("port", {
      default: defaultPort,
      type: "number",
    })
    .option("repo", {
      default: defaultRepo,
      type: "string",
    })
    .help()
    .parse();

  await startUpdateTestServer({
    host: argv.host,
    port: argv.port,
    repo: argv.repo,
  });
}

if (isExecutedAsScript()) {
  void startCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
