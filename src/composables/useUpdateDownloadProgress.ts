/**
 * アップデート用インストーラーのダウンロード進捗を管理する composable。
 * グローバルな reactive ref を持ち、以下の 2 箇所から参照される:
 * - ipcMessageReceiverPlugin.ts: メインプロセスからの UPDATE_DOWNLOAD_PROGRESS イベントで更新
 * - UpdateNotificationDialog/Container.vue: ダウンロード進捗の表示に使用
 * Vuex Store ではなく独立した composable にしている理由は、
 * ダウンロード進捗は一時的な UI 状態であり、Store に永続化する必要がないため。
 */

import { ref } from "vue";

/** ダウンロード進捗情報 (null はダウンロード未開始または進捗リセット状態) */
const downloadProgress = ref<{
  downloadedBytes: number;
  totalBytes: number;
} | null>(null);

/**
 * アップデート用インストーラーのダウンロード進捗を取得する。
 * @returns ダウンロード済みバイト数と合計バイト数を保持する reactive ref
 */
export function useUpdateDownloadProgress(): {
  downloadProgress: typeof downloadProgress;
} {
  return { downloadProgress };
}

/**
 * アップデート用インストーラーのダウンロード進捗を更新する。
 * ipcMessageReceiverPlugin.ts の UPDATE_DOWNLOAD_PROGRESS ハンドラから呼び出される。
 * @param progress ダウンロード進捗 (リセット時は null)
 */
export function setUpdateDownloadProgress(
  progress: { downloadedBytes: number; totalBytes: number } | null,
): void {
  downloadProgress.value = progress;
}
