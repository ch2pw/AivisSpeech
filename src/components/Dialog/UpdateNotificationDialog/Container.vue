<!--
  アップデート通知ダイアログのコンテナ。
  スキップしたバージョンより新しいバージョンがあれば、ダイアログを表示する。

  アプリ内ダウンロード機能:
  - 「アップデート」ボタンでインストーラーを Downloads フォルダにダウンロードする
  - ダウンロード中は進捗バーを表示し、キャンセル可能
  - ダウンロード完了後、Windows ではインストーラーを起動してアプリを終了する
  - macOS では DMG を Finder で開き、ユーザーが手動で /Applications にコピーする
  - フォールバックとして「公式サイトからダウンロード」ボタンも残している
-->

<template>
  <UpdateNotificationDialog
    v-if="newUpdateResult.status == 'updateAvailable'"
    v-model:dialogOpened="isDialogOpenComputed"
    :latestVersion="newUpdateResult.latestVersion"
    :newUpdateInfos="newUpdateResult.newUpdateInfos"
    :downloadState
    :downloadProgress
    :downloadError
    :isMacOS
    :isUpdateSupported
    @skipThisVersionClick="handleSkipThisVersionClick"
    @startDownload="handleStartDownload"
    @cancelDownload="handleCancelDownload"
    @launchInstaller="handleLaunchInstaller"
  />
</template>

<script setup lang="ts">
import semver from "semver";
import { computed, ref, watchEffect } from "vue";
import UpdateNotificationDialog from "./Presentation.vue";
import { useFetchNewUpdateInfos } from "@/composables/useFetchNewUpdateInfos";
import {
  setUpdateDownloadProgress,
  useUpdateDownloadProgress,
} from "@/composables/useUpdateDownloadProgress";
import { useStore } from "@/store";
import { UrlString } from "@/type/preload";
import { getAppInfos } from "@/domain/appInfo";

const props = defineProps<{
  canOpenDialog: boolean; // ダイアログを開いても良いかどうか
}>();

const store = useStore();

// ダウンロード状態の管理
// idle → downloading → downloaded → installing の順に遷移する
// エラー時は error に遷移し、リトライで idle に戻る
const downloadState = ref<
  "idle" | "downloading" | "downloaded" | "installing" | "error"
>("idle");
const downloadedInstallerPath = ref<string | null>(null);
const downloadError = ref<string | null>(null);

// ダウンロード試行ごとに加算する ID
// キャンセル→即リトライ時に、古い Promise の結果が新しいダウンロード状態を上書きするのを防ぐ
// handleStartDownload / handleCancelDownload の両方でインクリメントする
let currentDownloadAttemptId = 0;

// メインプロセスからの UPDATE_DOWNLOAD_PROGRESS イベントで更新される進捗情報
const { downloadProgress } = useUpdateDownloadProgress();

// preload 経由でプラットフォーム判定 (contextIsolation 環境でも process.platform にアクセス可能)
const updatePlatform = window.backend.getUpdatePlatform();
// macOS ではインストール後にアプリを終了しないため、ボタン文言を切り替える
const isMacOS = computed(() => {
  return updatePlatform?.startsWith("macos") === true;
});
// アプリ内アップデートに対応しているか (Linux / ブラウザビルドでは非対応)
const isUpdateSupported = computed(() => {
  return updatePlatform != null;
});

const isDialogOpenComputed = computed({
  get: () => store.state.isUpdateNotificationDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isUpdateNotificationDialogOpen: val,
    }),
});

// エディタのアップデート確認
if (!import.meta.env.VITE_LATEST_UPDATE_INFOS_URL) {
  throw new Error(
    "環境変数VITE_LATEST_UPDATE_INFOS_URLが設定されていません。.envに記載してください。",
  );
}

// アプリのバージョンとスキップしたバージョンのうち、新しい方を返す
const currentVersionGetter = async () => {
  const appVersion = getAppInfos().version;

  await store.actions.WAIT_VUEX_READY({ timeout: 15000 });
  const skipUpdateVersion = store.state.skipUpdateVersion ?? "0.0.0";
  if (semver.valid(skipUpdateVersion) == undefined) {
    throw new Error(`skipUpdateVersionが不正です: ${skipUpdateVersion}`);
  }

  return semver.gt(appVersion, skipUpdateVersion)
    ? appVersion
    : skipUpdateVersion;
};

// 新しいバージョンがあれば取得
const newUpdateResult = useFetchNewUpdateInfos(
  currentVersionGetter,
  UrlString(import.meta.env.VITE_LATEST_UPDATE_INFOS_URL),
);

// 新しいバージョンのアップデートがスキップされたときの処理
const handleSkipThisVersionClick = (version: string) => {
  void store.actions.SET_ROOT_MISC_SETTING({
    key: "skipUpdateVersion",
    value: version,
  });
};

/**
 * アップデート用インストーラーのダウンロードを開始する。
 * メインプロセスの DOWNLOAD_UPDATE ハンドラにバージョン番号のみを渡す。
 * URL 構築はメインプロセス側が行うため、レンダラーは URL を知る必要がない。
 */
const handleStartDownload = async () => {
  if (newUpdateResult.value.status != "updateAvailable") {
    return;
  }

  // 試行 ID をインクリメントし、この試行固有の ID を記録する
  currentDownloadAttemptId += 1;
  const thisAttemptId = currentDownloadAttemptId;
  downloadState.value = "downloading";
  downloadedInstallerPath.value = null;
  downloadError.value = null;
  setUpdateDownloadProgress(null);

  // メインプロセスにバージョン番号のみを渡してダウンロードを開始する
  // ダウンロード中は UPDATE_DOWNLOAD_PROGRESS イベントで進捗が通知される
  const result = await window.backend.downloadUpdate({
    version: newUpdateResult.value.latestVersion,
  });

  // キャンセルや再ダウンロードによって、この試行が古くなっている場合は結果を無視する
  // これにより、キャンセル→即リトライ時に古い Promise の結果が新しい状態を壊すのを防ぐ
  if (thisAttemptId !== currentDownloadAttemptId) {
    return;
  }

  if (result.ok) {
    downloadState.value = "downloaded";
    downloadedInstallerPath.value = result.value.installerPath;
    return;
  }

  downloadState.value = "error";
  downloadError.value = result.error.message;
};

/**
 * 進行中のダウンロードをキャンセルする。
 * 試行 ID をインクリメントして、キャンセルされた試行の結果を無視するようにする。
 */
const handleCancelDownload = async () => {
  currentDownloadAttemptId += 1;
  await window.backend.cancelUpdateDownload();
  downloadState.value = "idle";
  downloadedInstallerPath.value = null;
  downloadError.value = null;
  setUpdateDownloadProgress(null);
};

/**
 * ダウンロード済みインストーラーを起動する。
 * Windows の場合のみ、アプリ終了前に未保存確認を行う。
 * macOS ではアプリは終了しないため、未保存確認は不要。
 */
const handleLaunchInstaller = async () => {
  if (downloadedInstallerPath.value == null) {
    return;
  }

  // Windows ではインストーラー起動後に app.quit() されるため、
  // 未保存の変更がある場合は事前に保存確認ダイアログを表示する
  if (isMacOS.value === false && store.getters.IS_EDITED === true) {
    const saveResult = await store.actions.SAVE_OR_DISCARD_PROJECT_FILE({});
    // ユーザーがキャンセルした場合はアップデートも中止
    if (saveResult === "canceled") {
      return;
    }
  }

  downloadState.value = "installing";
  try {
    await window.backend.launchUpdateInstaller({
      installerPath: downloadedInstallerPath.value,
    });
  } catch (error) {
    // インストーラーの起動に失敗した場合（ファイルが消されていた、権限不足など）
    downloadState.value = "error";
    downloadError.value =
      error instanceof Error
        ? error.message
        : "インストーラーの起動に失敗しました。";
  }
};

// ダイアログを開くかどうか
const stopWatchEffect = watchEffect(() => {
  if (
    props.canOpenDialog &&
    newUpdateResult.value.status == "updateAvailable"
  ) {
    isDialogOpenComputed.value = true;
    stopWatchEffect(); // ダイアログを再表示させない
  }
});
</script>
