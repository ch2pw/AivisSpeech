import http from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import process from "node:process";
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

const argv = await yargs(hideBin(process.argv))
  .option("host", {
    default: "127.0.0.1",
    type: "string",
  })
  .option("port", {
    default: 18080,
    type: "number",
  })
  .option("repo", {
    default: "Aivis-Project/AivisSpeech",
    type: "string",
  })
  .help()
  .parse();

const githubApiHeaders: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "AivisSpeech-update-test-server",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN != null && process.env.GITHUB_TOKEN !== "") {
  githubApiHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

let latestDevReleaseCache: GitHubRelease | undefined;

/**
 * 最新の dev prerelease を GitHub Releases API から取得する。
 * @returns 最新の dev prerelease
 */
async function fetchLatestDevRelease(): Promise<GitHubRelease> {
  if (latestDevReleaseCache != null) {
    return latestDevReleaseCache;
  }

  const releaseResponse = await fetch(
    `https://api.github.com/repos/${argv.repo}/releases`,
    {
      headers: githubApiHeaders,
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
      `Failed to find latest dev release. repo: ${argv.repo}, releaseCount: ${releases.length}`,
    );
  }

  latestDevReleaseCache = latestDevRelease;
  console.log(`Using latest dev release: ${latestDevRelease.tag_name}`);
  return latestDevRelease;
}

/**
 * テスト用に見せるファイル名から、実際の nightly アセットを選択する。
 * @param requestedFileName テスト対象アプリから要求されたファイル名
 * @returns 実際に GitHub から取得する release asset
 */
async function resolveReleaseAsset(
  requestedFileName: string,
): Promise<GitHubReleaseAsset> {
  const release = await fetchLatestDevRelease();
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
 * @param requestedFileName テスト対象アプリから要求されたファイル名
 * @param response HTTP レスポンス
 */
async function proxyReleaseAsset(
  requestedFileName: string,
  response: http.ServerResponse,
): Promise<void> {
  const asset = await resolveReleaseAsset(requestedFileName);
  console.log(`Proxying release asset: ${asset.name}`);

  const assetResponse = await fetch(asset.browser_download_url, {
    headers:
      githubApiHeaders.Authorization == null
        ? undefined
        : { Authorization: githubApiHeaders.Authorization },
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

const server = http.createServer((request, response) => {
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
        await proxyReleaseAsset(requestedFileName, response);
        return;
      }

      response.writeHead(404);
      response.end("Not Found");
    } catch (error) {
      console.error(error);
      response.writeHead(500);
      response.end(String(error));
    }
  })();
});

server.listen(argv.port, argv.host, () => {
  console.log(
    `AivisSpeech update test server is listening. url: http://${argv.host}:${argv.port}`,
  );
});
