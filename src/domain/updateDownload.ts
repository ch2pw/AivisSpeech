/**
 * アプリ内自動アップデートのプラットフォーム判定・ファイル名生成ユーティリティ。
 * メインプロセス (ipcMainHandle.ts)とテストから参照される。
 * URL 構築はメインプロセス側の DOWNLOAD_UPDATE ハンドラが担当するため、
 * このモジュールには URL 構築関数を含めない。
 */

/**
 * 自動アップデートが対応しているプラットフォーム種別。
 * 全て小文字で統一し、GitHub Releases のアセット名とは独立した内部識別子として扱う。
 * アセット名への変換は getInstallerFileName() が行う。
 */
export type UpdatePlatform = "windows-x64" | "macos-x64" | "macos-arm64";

const OFFICIAL_UPDATE_BASE_URL =
  "https://github.com/Aivis-Project/AivisSpeech/releases/download";

/**
 * アップデート機能の手動 / E2E テストで、常に更新対象として扱うバージョン。
 * 通常の dev 版バージョン (999.999.999) より大きい値にしている。
 */
export const UPDATE_TEST_VERSION = "9999.0.0";

/**
 * process.platform / process.arch の型を切り出したもの。
 * レンダラープロセス (contextIsolation 環境)では process が存在しないため、
 * typeof process === "undefined" チェックを行うために使用する。
 */
type PlatformProcess = {
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
};

/**
 * 現在の実行環境で利用するアップデート用インストーラーの種別を判定する。
 * メインプロセスおよびテスト環境では process.platform / process.arch を使用する。
 * レンダラープロセス (contextIsolation 環境)では process が存在しないため null を返す。
 * レンダラーからプラットフォームを取得するには preload 経由の getUpdatePlatform() を使用すること。
 * @returns 対応するインストーラー種別 (未対応の OS / CPU の場合は null)
 */
export function getCurrentUpdatePlatform(): UpdatePlatform | null {
  // レンダラープロセスでは process が存在しない場合がある
  const currentProcess: PlatformProcess | undefined =
    typeof process === "undefined" ? undefined : process;

  if (
    currentProcess?.platform === "win32" &&
    currentProcess.arch === "x64"
  ) {
    return "windows-x64";
  }

  if (
    currentProcess?.platform === "darwin" &&
    currentProcess.arch === "x64"
  ) {
    return "macos-x64";
  }

  if (
    currentProcess?.platform === "darwin" &&
    currentProcess.arch === "arm64"
  ) {
    return "macos-arm64";
  }

  return null;
}

/**
 * プラットフォーム種別とバージョンから、GitHub Releases に配置されている
 * インストーラーのファイル名を生成する。
 * 内部識別子 (小文字) から GitHub Releases のアセット命名規則への変換を行う。
 * @param platform インストーラーを選択する対象プラットフォーム
 * @param version ダウンロード対象の AivisSpeech バージョン (例: "1.2.0")
 * @returns GitHub Releases に配置されているインストーラーのファイル名
 */
export function getInstallerFileName(
  platform: UpdatePlatform,
  version: string,
): string {
  // キーは内部識別子 (小文字)、値は GitHub Releases のアセット名
  const patterns: Record<UpdatePlatform, string> = {
    "windows-x64": `AivisSpeech-Windows-x64-${version}.exe`,
    "macos-x64": `AivisSpeech-macOS-x64-${version}.dmg`,
    "macos-arm64": `AivisSpeech-macOS-arm64-${version}.dmg`,
  };

  return patterns[platform];
}

/**
 * テスト用アップデート配信サーバーの URL を取得する。
 * 空文字列は未指定として扱う。
 * @returns テスト用アップデート配信サーバーの URL (未指定の場合は undefined)
 */
export function getUpdateTestUrl(): string | undefined {
  const updateTestUrl = process.env.AIVISSPEECH_UPDATE_TEST_URL?.trim();

  if (updateTestUrl == null || updateTestUrl === "") {
    return undefined;
  }

  return updateTestUrl;
}

/**
 * ベース URL と相対パスを結合する。
 * @param baseUrl ベース URL
 * @param pathName 結合する相対パス
 * @returns 結合後の URL
 */
function joinUrl(baseUrl: string, pathName: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPathName = pathName.replace(/^\/+/, "");
  return new URL(normalizedPathName, normalizedBaseUrl).toString();
}

/**
 * アップデート情報 JSON の URL を解決する。
 * @param defaultUpdateInfosUrl 通常利用するアップデート情報 JSON の URL
 * @returns 実際に取得するアップデート情報 JSON の URL
 */
export function resolveUpdateInfosUrl(defaultUpdateInfosUrl: string): string {
  const updateTestUrl = getUpdateTestUrl();

  if (updateTestUrl != null) {
    return joinUrl(updateTestUrl, "updateInfos.json");
  }

  return defaultUpdateInfosUrl;
}

/**
 * インストーラーのダウンロード URL とファイル名を解決する。
 * @param platform インストーラーを選択する対象プラットフォーム
 * @param version ダウンロード対象の AivisSpeech バージョン
 * @returns インストーラーのダウンロード URL とファイル名
 */
export function resolveUpdateInstallerDownload(
  platform: UpdatePlatform,
  version: string,
): { fileName: string; url: string } {
  const fileName = getInstallerFileName(platform, version);
  const baseUrl = getUpdateTestUrl() ?? OFFICIAL_UPDATE_BASE_URL;
  const url = joinUrl(baseUrl, `${version}/${fileName}`);

  return { fileName, url };
}
