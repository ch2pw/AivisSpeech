/**
 * アップデート用インストーラーのダウンロード処理を管理するモジュール。
 * 設計方針:
 * - Electron 固有の API (app, shell 等) には依存しない。
 *   app.getPath('downloads') 等はコンストラクタで注入し、ユニットテスト可能にしている。
 * - ダウンロード中のファイルは ".downloading" 拡張子で保存し、完了時にリネームする。
 *   これにより途中で中断されたファイルをユーザーが誤って実行することを防ぐ。
 * - 同時ダウンロードは 1 つまで (isDownloading フラグで排他制御)。
 * - GitHub Releases は 302 リダイレクトを返すため、最大 5 回までフォローする。
 *   リダイレクト先は HTTPS 必須（テスト時は allowInsecureRedirects で無効化可能）。
 */

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { failure, Result, success } from "@/type/result";

/** ダウンロード進捗通知のコールバック型 */
type DownloadProgressCallback = (
  downloadedBytes: number,
  totalBytes: number,
) => void;

/**
 * アップデート用インストーラーのダウンロード処理を管理する。
 * ipcMainHandle.ts の DOWNLOAD_UPDATE ハンドラから利用される。
 */
export class UpdateManager {
  /** ダウンロードのキャンセルに使用する AbortController */
  private abortController: AbortController | null = null;

  /** 同時ダウンロードの排他制御フラグ */
  private isDownloading = false;

  /**
   * UpdateManager のインスタンスを初期化する。
   * @param getDownloadsPath インストーラーの保存先となる Downloads パスを返す関数
   *   (本番: () => app.getPath("downloads"), テスト: テスト用一時ディレクトリ)
   * @param allowInsecureRedirects テスト用: リダイレクト先の HTTPS 強制を無効化する
   *   (テストのモックサーバーは HTTP のみなので、このフラグで検証をスキップする。本番では常に false)
   */
  constructor(
    private readonly getDownloadsPath: () => string,
    private readonly allowInsecureRedirects = false,
  ) {}

  /**
   * 直前にダウンロードしたインストーラーのパス。
   * LAUNCH_UPDATE_INSTALLER ハンドラで、レンダラーから渡された任意パスの実行を防ぐために、
   * 「直前に UpdateManager がダウンロードしたパス」と一致するかの検証に使用する。
   */
  private lastDownloadedInstallerPath: string | null = null;

  /**
   * 直前にダウンロードしたインストーラーのパスを返す。
   * LAUNCH_UPDATE_INSTALLER ハンドラで、任意パスの実行を防ぐ検証に使用する。
   * @returns 直前にダウンロードしたインストーラーのパス (未ダウンロード時は null)
   */
  getLastDownloadedInstallerPath(): string | null {
    return this.lastDownloadedInstallerPath;
  }

  /**
   * アップデート用インストーラーをダウンロードする。
   * ダウンロード中は onProgress コールバックで進捗を通知する。
   * ダウンロード先は getDownloadsPath() で取得したディレクトリ内に保存される。
   * @param params.url ダウンロード URL (メインプロセスの DOWNLOAD_UPDATE ハンドラが構築した URL)
   * @param params.fileName 保存するファイル名 (パストラバーサル防止のため basename のみ使用される)
   * @param params.onProgress ダウンロード進捗コールバック
   * @returns ダウンロード済みインストーラーのパスを含む Result
   */
  async downloadUpdate(params: {
    url: string;
    fileName: string;
    onProgress: DownloadProgressCallback;
  }): Promise<Result<{ installerPath: string }>> {
    // パストラバーサル防止: basename のみを使用し、ディレクトリ区切り文字を除去
    const safeFileName = path.basename(params.fileName);
    // '.' / '..' / '' は不正なファイル名として拒否
    // path.basename('..') は '..' を返すため、明示的にチェックが必要
    if (safeFileName === "" || safeFileName === "." || safeFileName === "..") {
      return failure(
        "invalidFileName",
        new Error(`Invalid file name: ${params.fileName}`),
      );
    }

    // 同時ダウンロードの排他制御
    // fileName 検証の後に配置することで、不正な fileName でロックが残るバグを防ぐ
    if (this.isDownloading) {
      return failure("alreadyDownloading", new Error("Already downloading"));
    }

    this.isDownloading = true;
    this.abortController = new AbortController();

    const downloadsPath = this.getDownloadsPath();
    const finalPath = path.join(downloadsPath, safeFileName);
    // ダウンロード中は .downloading 拡張子で保存し、完了時にリネームする
    const downloadingPath = `${finalPath}.downloading`;

    let isDownloadSucceeded = false;
    try {
      // HTTP(S) ダウンロードを実行（リダイレクトフォロー付き）
      await this.downloadFile({
        url: params.url,
        destPath: downloadingPath,
        onProgress: params.onProgress,
        maxRedirects: 5,
      });

      // ダウンロード完了: .downloading → 最終ファイル名にリネーム
      await fs.promises.rename(downloadingPath, finalPath);

      // LAUNCH_UPDATE_INSTALLER での検証用に、ダウンロードしたパスを記録
      this.lastDownloadedInstallerPath = finalPath;
      isDownloadSucceeded = true;

      return success({ installerPath: finalPath });
    } catch (error) {
      // ユーザーによるキャンセルの場合は専用のエラーコードを返す
      if (this.abortController?.signal.aborted === true) {
        return failure("downloadCancelled", new Error("Download cancelled"));
      }

      // ネットワークエラーやファイルシステムエラーの場合
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return failure("downloadFailed", new Error(errorMessage));
    } finally {
      // ダウンロード状態をリセット（成功・失敗・キャンセルのいずれでも実行）
      this.isDownloading = false;
      this.abortController = null;

      // ダウンロード失敗・キャンセル時は .downloading ファイルを削除する
      // ユーザーの Downloads フォルダに巨大な .downloading ファイルが溜まるのを防ぐ
      if (isDownloadSucceeded !== true) {
        try {
          await fs.promises.unlink(downloadingPath);
        } catch {
          // ファイルが存在しない場合やアクセスできない場合は無視する
        }
      }
    }
  }

  /**
   * 進行中のダウンロードをキャンセルする。
   * AbortController.abort() を呼ぶことで、downloadFile 内の HTTP リクエストが中断される。
   */
  cancelDownload(): void {
    this.abortController?.abort();
  }

  /**
   * HTTP(S) でファイルをダウンロードする。
   * GitHub Releases は 302 リダイレクトを返すため、再帰的にリダイレクトをフォローする。
   *
   * @param params.url ダウンロード URL
   * @param params.destPath ダウンロードしたファイルの保存先パス
   * @param params.onProgress ダウンロード進捗コールバック
   * @param params.maxRedirects 残りリダイレクトフォロー回数 (無限ループ防止用)
   * @returns ダウンロード完了時に resolve される Promise
   */
  private downloadFile(params: {
    url: string;
    destPath: string;
    onProgress: DownloadProgressCallback;
    maxRedirects: number;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestUrl = new URL(params.url);
      // URL のプロトコルに応じて https / http モジュールを切り替え
      const client = requestUrl.protocol === "https:" ? https : http;
      const abortSignal = this.abortController?.signal;

      // 既にキャンセル済みの場合は即座に reject
      if (abortSignal?.aborted === true) {
        reject(new Error("Download cancelled"));
        return;
      }

      // abort 時に fileStream も破棄するため、関数スコープで宣言する
      // レスポンス受信後に createWriteStream で初期化される
      let fileStream: fs.WriteStream | null = null;

      const request = client.get(requestUrl, (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        // 3xx リダイレクトレスポンスの処理
        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          location != undefined
        ) {
          // リダイレクトレスポンスのボディは不要なので破棄
          response.resume();

          if (params.maxRedirects <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }

          // リダイレクト先 URL を解決（相対パスにも対応）
          const redirectedUrl = new URL(location, requestUrl);

          // リダイレクト先も HTTPS であることを強制する
          // GitHub Releases は https://objects.githubusercontent.com/ にリダイレクトするが、
          // 中間プロキシ等で HTTP にダウングレードされるケースを防ぐ
          if (
            this.allowInsecureRedirects !== true &&
            redirectedUrl.protocol !== "https:"
          ) {
            reject(
              new Error(
                `Redirect to non-HTTPS URL is not allowed: ${redirectedUrl.href}`,
              ),
            );
            return;
          }

          // リダイレクト先に再帰的にリクエスト（残りリダイレクト回数を減算）
          this.downloadFile({
            ...params,
            url: redirectedUrl.href,
            maxRedirects: params.maxRedirects - 1,
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        // 2xx 以外のレスポンスはエラーとして扱う
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Download failed with status code: ${statusCode}`));
          return;
        }

        // Content-Length ヘッダから合計バイト数を取得（プログレスバーの分母に使用）
        // ヘッダが存在しない場合（チャンク転送など）は 0 を使用し、
        // プログレスバーは indeterminate モードで表示される
        const totalBytesHeader = response.headers["content-length"];
        const totalBytes =
          typeof totalBytesHeader === "string"
            ? Number.parseInt(totalBytesHeader, 10)
            : 0;
        const progressTotalBytes = Number.isFinite(totalBytes)
          ? totalBytes
          : 0;
        let downloadedBytes = 0;

        // ダウンロードしたデータをファイルに書き込む WriteStream を作成
        fileStream = fs.createWriteStream(params.destPath);

        // データチャンクごとに進捗を通知
        response.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          params.onProgress(downloadedBytes, progressTotalBytes);
        });

        // finish ではなく close を待つことで、ファイルディスクリプタの完全なクローズを保証する
        // Windows では close 前の rename が EPERM で失敗する場合があるため
        fileStream.on("close", () => {
          resolve();
        });

        fileStream.on("error", (error) => {
          reject(error);
        });

        response.on("error", (error) => {
          fileStream?.destroy();
          reject(error);
        });

        // レスポンスボディをファイルにパイプ
        response.pipe(fileStream);
      });

      request.on("error", (error) => {
        reject(error);
      });

      // ユーザーキャンセル時のハンドラ
      // fileStream と request の両方を破棄してリソースリークを防ぐ
      abortSignal?.addEventListener(
        "abort",
        () => {
          fileStream?.destroy();
          request.destroy(new Error("Download cancelled"));
          reject(new Error("Download cancelled"));
        },
        { once: true },
      );
    });
  }
}
