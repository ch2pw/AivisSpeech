<template>
  <QDialog v-model="dialogOpened">
    <QCard class="q-py-none dialog-card" style="padding: 0px 28px !important;">
      <!-- ヘッダー: アップデート通知タイトルと説明文 -->
      <QCardSection class="q-px-none q-py-lg">
        <div class="text-h5">アップデートがあります</div>
        <div class="text-body2 text-grey q-mt-sm">
          AivisSpeech の最新バージョンをダウンロードできます。
        </div>
      </QCardSection>

      <QSeparator />

      <!-- リリースノート: バージョンごとの変更内容を一覧表示 -->
      <QCardSection class="q-px-none scroll scrollable-area" style="padding: 20px 0px !important;">
        <template
          v-for="(info, infoIndex) of props.newUpdateInfos"
          :key="infoIndex"
        >
          <h3 class="version-title">バージョン {{ info.version }}</h3>
          <ul class="q-mb-none q-mt-sm">
            <template
              v-for="(item, descriptionIndex) of info.descriptions"
              :key="descriptionIndex"
            >
              <li>{{ item }}</li>
            </template>
          </ul>
        </template>
      </QCardSection>

      <QSeparator />

      <!-- ダウンロード中: プログレスバーとダウンロード進捗テキストを表示 -->
      <QCardSection
        v-if="props.downloadState == 'downloading'"
        class="q-px-none q-pt-lg q-pb-none"
      >
        <!-- totalBytes が不明（0 以下）の場合は indeterminate モードで表示 -->
        <QLinearProgress
          :value="downloadProgressRatio"
          :indeterminate="isDownloadProgressIndeterminate"
          color="primary"
          trackColor="surface"
          rounded
          instantFeedback
        />
        <div class="text-body2 text-grey q-mt-sm">
          {{ downloadProgressText }}
        </div>
      </QCardSection>

      <!-- インストール中: 状態表示テキスト -->
      <QCardSection
        v-else-if="props.downloadState == 'installing'"
        class="q-px-none q-pt-lg q-pb-none"
      >
        <div class="text-body2 text-grey">インストール中...</div>
      </QCardSection>

      <!-- エラー: エラーメッセージを表示 -->
      <QCardSection
        v-else-if="props.downloadState == 'error'"
        class="q-px-none q-pt-lg q-pb-none"
      >
        <div class="text-negative text-body2">
          {{ props.downloadError ?? "ダウンロードに失敗しました。" }}
        </div>
      </QCardSection>

      <!-- アクションボタン: downloadState に応じてボタンを切り替え -->
      <QCardActions class="q-px-none q-py-lg update-actions">
        <QSpace />

        <!-- idle 状態: 閉じる / 公式サイト（フォールバック） / アップデート（メインアクション） -->
        <QBtn
          v-if="props.downloadState == 'idle'"
          padding="xs md"
          icon="sym_r_close"
          label="閉じる"
          unelevated
          color="surface"
          textColor="display"
          class="text-bold"
          @click="closeUpdateNotificationDialog()"
        />
        <!-- <QBtn
          padding="xs md"
          label="このバージョンをスキップ"
          unelevated
          color="surface"
          textColor="display"
          class="text-bold"
          @click="
            emit('skipThisVersionClick', props.latestVersion);
            closeUpdateNotificationDialog();
          "
        /> -->
        <!-- アプリ内ダウンロードが使えない環境向けのフォールバック -->
        <QBtn
          v-if="props.downloadState == 'idle'"
          padding="xs md"
          icon="sym_r_open_in_new"
          label="公式サイトからダウンロード"
          unelevated
          color="surface"
          textColor="display"
          class="text-bold"
          @click="
            openOfficialWebsite();
            closeUpdateNotificationDialog();
          "
        />
        <!-- アプリ内ダウンロードを開始するメインアクション -->
        <!-- 未対応プラットフォーム (Linux / ブラウザビルド等) では非表示 -->
        <QBtn
          v-if="props.downloadState == 'idle' && props.isUpdateSupported"
          padding="xs md"
          icon="sym_r_download"
          label="アップデート"
          unelevated
          color="primary"
          textColor="display-on-primary"
          class="text-bold"
          @click="emit('startDownload')"
        />

        <!-- downloading 状態: キャンセルボタン -->
        <QBtn
          v-if="props.downloadState == 'downloading'"
          padding="xs md"
          icon="sym_r_close"
          label="キャンセル"
          unelevated
          color="surface"
          textColor="display"
          class="text-bold"
          @click="emit('cancelDownload')"
        />

        <!-- downloaded 状態: インストール実行ボタン -->
        <!-- macOS と Windows でボタン文言が異なる -->
        <template v-if="props.downloadState == 'downloaded'">
          <!-- macOS: アプリは終了しないので「閉じる」 / Windows: app.quit() されるので「キャンセル」 -->
          <QBtn
            v-if="props.isMacOS"
            padding="xs md"
            icon="sym_r_close"
            label="閉じる"
            unelevated
            color="surface"
            textColor="display"
            class="text-bold"
            @click="closeUpdateNotificationDialog()"
          />
          <QBtn
            v-else
            padding="xs md"
            icon="sym_r_close"
            label="キャンセル"
            unelevated
            color="surface"
            textColor="display"
            class="text-bold"
            @click="closeUpdateNotificationDialog()"
          />
          <!-- macOS: DMG を Finder で開く / Windows: NSIS インストーラーを起動して再起動 -->
          <QBtn
            padding="xs md"
            icon="sym_r_install_desktop"
            :label="props.isMacOS ? 'インストーラーを開く' : 'インストールして再起動'"
            unelevated
            color="primary"
            textColor="display-on-primary"
            class="text-bold"
            @click="emit('launchInstaller')"
          />
        </template>

        <!-- error 状態: リトライ / 公式サイトからダウンロード（フォールバック） -->
        <template v-if="props.downloadState == 'error'">
          <QBtn
            padding="xs md"
            icon="sym_r_refresh"
            label="リトライ"
            unelevated
            color="primary"
            textColor="display-on-primary"
            class="text-bold"
            @click="emit('startDownload')"
          />
          <QBtn
            padding="xs md"
            icon="sym_r_open_in_new"
            label="公式サイトからダウンロード"
            unelevated
            color="surface"
            textColor="display"
            class="text-bold"
            @click="
              openOfficialWebsite();
              closeUpdateNotificationDialog();
            "
          />
        </template>

        <!-- installing 状態: 操作不可の状態表示ボタン -->
        <QBtn
          v-if="props.downloadState == 'installing'"
          padding="xs md"
          icon="sym_r_hourglass_empty"
          label="インストール中..."
          unelevated
          disable
          color="surface"
          textColor="display"
          class="text-bold"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { UpdateInfo } from "@/type/preload";

const dialogOpened = defineModel<boolean>("dialogOpened", { default: false });
const props = defineProps<{
  /** 公開されている最新のバージョン */
  latestVersion: string;
  /** 表示するアップデート情報 */
  newUpdateInfos: UpdateInfo[];
  /** インストーラーのダウンロード状態 */
  downloadState: "idle" | "downloading" | "downloaded" | "installing" | "error";
  /** インストーラーのダウンロード進捗（メインプロセスから IPC で通知される） */
  downloadProgress: { downloadedBytes: number; totalBytes: number } | null;
  /** インストーラーのダウンロードエラーメッセージ */
  downloadError: string | null;
  /** macOS で実行されているかどうか (ボタン文言の切り替えに使用) */
  isMacOS: boolean;
  /** アプリ内アップデートに対応しているプラットフォームかどうか */
  isUpdateSupported: boolean;
}>();
const emit = defineEmits<{
  /** スキップするときに呼ばれる */
  (e: "skipThisVersionClick", version: string): void;
  /** インストーラーのダウンロードを開始するときに呼ばれる */
  (e: "startDownload"): void;
  /** インストーラーのダウンロードをキャンセルするときに呼ばれる */
  (e: "cancelDownload"): void;
  /** ダウンロード済みインストーラーを起動するときに呼ばれる */
  (e: "launchInstaller"): void;
}>();

/**
 * ダウンロード進捗の比率（0〜1）。
 * QLinearProgress の value として使用する。
 * totalBytes が 0 以下の場合は 0 を返す (indeterminate モードになる)。
 */
const downloadProgressRatio = computed(() => {
  if (
    props.downloadProgress == null ||
    props.downloadProgress.totalBytes <= 0
  ) {
    return 0;
  }

  return Math.min(
    Math.max(
      props.downloadProgress.downloadedBytes / props.downloadProgress.totalBytes,
      0,
    ),
    1,
  );
});

/**
 * ダウンロード進捗を determinate / indeterminate のどちらで表示するか。
 * totalBytes が不明な間は indeterminate にし、値が分かったら実際の比率を即時反映する。
 */
const isDownloadProgressIndeterminate = computed(() => {
  return (
    props.downloadProgress == null ||
    props.downloadProgress.totalBytes <= 0
  );
});

/**
 * バイト数を MB 単位の人間可読文字列に変換する。
 * @param bytes バイト数
 * @returns "XX.X MB" 形式の文字列
 */
const formatBytesAsMegabytes = (bytes: number): string => {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * ダウンロード進捗テキスト。
 * - 進捗情報がない場合: 「ダウンロードを開始しています。」
 * - totalBytes が不明の場合: 「XX.X MB をダウンロードしました。」
 * - totalBytes が既知の場合: 「XX.X MB / YY.Y MB (ZZ%)」
 */
const downloadProgressText = computed(() => {
  if (props.downloadProgress == null) {
    return "ダウンロードを開始しています。";
  }

  if (props.downloadProgress.totalBytes <= 0) {
    return `${formatBytesAsMegabytes(props.downloadProgress.downloadedBytes)} をダウンロードしました。`;
  }

  const percent = Math.round(downloadProgressRatio.value * 100);
  return `${formatBytesAsMegabytes(
    props.downloadProgress.downloadedBytes,
  )} / ${formatBytesAsMegabytes(props.downloadProgress.totalBytes)} (${percent}%)`;
});

const closeUpdateNotificationDialog = () => {
  dialogOpened.value = false;
};

/** 公式サイトをブラウザで開く（アプリ内ダウンロードが使えない場合のフォールバック） */
const openOfficialWebsite = () => {
  window.open(import.meta.env.VITE_OFFICIAL_WEBSITE_URL, "_blank");
};
</script>

<style scoped lang="scss">
@use "@/styles/colors" as colors;

.dialog-card {
  width: 700px;
  max-width: 80vw;
}

.scrollable-area {
  overflow-y: auto;
  max-height: 50vh;

  :deep() {
    h3 {
      font-size: 1.3rem;
      font-weight: bold;
      margin: 0;
    }
  }

  .version-title {
    line-height: 1.5;
    margin-top: 16px !important;

    &:first-child {
      margin-top: 0 !important;
    }
  }

  li {
    margin-top: 4px !important;

    &:first-child {
      margin-top: 0 !important;
    }
  }
}

</style>
