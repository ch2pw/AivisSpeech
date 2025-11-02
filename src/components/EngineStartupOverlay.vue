<template>
  <!-- TODO: 複数エンジン対応 -->
  <!-- TODO: allEngineStateが "ERROR" のときエラーになったエンジンを探してトーストで案内 -->
  <div v-if="allEngineState === 'FAILED_STARTING'" class="waiting-engine">
    <div>
      音声合成エンジンの起動に失敗しました。音声合成エンジンの再起動をお試しください。<br>
      <div class="q-mt-sm"></div>
      AivisSpeech を起動するには、PC に 1.5GB 以上の空きメモリ (RAM) が必要です。<br>
      また、インストール・アップデート後の初回起動時はインターネット接続が必要です。<br>
      <div class="q-mt-sm"></div>
      企業内ネットワークや HTTPS プロキシ経由などの特殊なインターネット環境では、<br>
      モデルデータのダウンロードができずに起動に失敗する場合があります。<br>
      詳細は「よくある質問・Q&A」に記載していますので、ご確認ください。<br>
      <div class="q-mt-sm"></div>
      また、ウイルス対策ソフトが音声合成エンジン (run.exe) を<br>
      不正なプログラムと誤って判断し、隔離している可能性もあります。<br>
      ウイルス対策ソフトの設定から、run.exe を許可リストに追加してください。<br>
      <div class="column q-mt-sm">
        <QBtn
          outline
          class="q-mt-sm text-no-wrap"
          textColor="display"
          icon="sym_r_help"
          label="よくある質問・Q&A を見る"
          @click="openQa"
        />
        <QBtn
          outline
          class="q-mt-sm text-no-wrap"
          textColor="display"
          icon="sym_r_description"
          label="ログフォルダを開く"
          @click="openLogDirectory"
        />
        <QBtn
          outline
          class="q-mt-sm text-no-wrap"
          textColor="display"
          icon="sym_r_description"
          label="音声合成エンジンのログフォルダを開く"
          @click="openDefaultEngineLogDirectory"
        />
      </div>
    </div>
  </div>
  <div
    v-else-if="
      !props.isCompletedInitialStartup || allEngineState === 'STARTING'
    "
    class="waiting-engine"
  >
    <div>
      <QSpinner color="primary" size="2.5rem" />
      <div style="margin-top: 12px">
        {{
          allEngineState === "STARTING"
            ? "音声合成エンジン起動中..."
            : "データ準備中..."
        }}
      </div>

      <template v-if="isEngineWaitingLong">
        <QSeparator style="margin-top: 12px; margin-bottom: 12px;" />
        音声合成エンジンの起動に時間がかかっています...<br />
        （初回のみ、セットアップのため起動に数分ほどかかります）<br />
        <div class="column q-mt-sm">
          <QBtn
            outline
            class="q-mt-sm text-no-wrap"
            textColor="display"
            icon="sym_r_help"
            label="よくある質問・Q&A を見る"
            @click="openQa"
          />
          <QBtn
            v-if="isMultipleEngine"
            outline
            class="q-mt-sm text-no-wrap"
            textColor="display"
            icon="sym_r_restart_alt"
            label="マルチエンジンをオフにして再読み込みする"
            :disable="reloadingLocked"
            @click="reloadAppWithMultiEngineOffMode"
          />
          <QBtn
          outline
            class="q-mt-sm text-no-wrap"
            textColor="display"
            icon="sym_r_description"
            label="ログフォルダを開く"
            @click="openLogDirectory"
          />
          <QBtn
          outline
            class="q-mt-sm text-no-wrap"
            textColor="display"
            icon="sym_r_description"
            label="音声合成エンジンのログフォルダを開く"
            @click="openDefaultEngineLogDirectory"
          />
        </div>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useStore } from "@/store";
import { EngineState } from "@/store/type";

const store = useStore();
const props = defineProps<{
  isCompletedInitialStartup: boolean;
}>();

const reloadingLocked = computed(() => store.state.reloadingLock);
const isMultipleEngine = computed(() => store.state.engineIds.length > 1);

// エンジン待機
// TODO: 個別のエンジンの状態をUIで確認できるようにする
const allEngineState = computed(() => {
  const engineStates = store.state.engineStates;

  let lastEngineState: EngineState | undefined = undefined;

  // 登録されているすべてのエンジンについて状態を確認する
  for (const engineId of store.state.engineIds) {
    const engineState: EngineState | undefined = engineStates[engineId];
    if (engineState == undefined)
      throw new Error(`No such engineState set: engineId == ${engineId}`);

    // FIXME: 1つでも接続テストに成功していないエンジンがあれば、暫定的に起動中とする
    if (engineState === "STARTING") {
      return engineState;
    }

    lastEngineState = engineState;
  }

  return lastEngineState; // FIXME: 暫定的に1つのエンジンの状態を返す
});

const isEngineWaitingLong = ref<boolean>(false);
let engineTimer: number | undefined = undefined;
watch(allEngineState, (newEngineState) => {
  if (engineTimer != undefined) {
    clearTimeout(engineTimer);
    engineTimer = undefined;
  }
  if (newEngineState === "STARTING") {
    isEngineWaitingLong.value = false;
    engineTimer = window.setTimeout(() => {
      isEngineWaitingLong.value = true;
    }, 20 * 1000);  // 20秒で警告を表示する
  } else {
    isEngineWaitingLong.value = false;
  }
});

const reloadAppWithMultiEngineOffMode = () => {
  void store.actions.CHECK_EDITED_AND_NOT_SAVE({
    closeOrReload: "reload",
    isMultiEngineOffMode: true,
  });
};

const openQa = () => {
  window.open("https://github.com/Aivis-Project/AivisSpeech/blob/master/public/qAndA.md", "_blank");
};
const openLogDirectory = () => window.backend.openLogDirectory();
const openDefaultEngineLogDirectory = () => window.backend.openDefaultEngineLogDirectory();
</script>

<style scoped lang="scss">
@use "@/styles/colors" as colors;
@use "@/styles/variables" as vars;

.waiting-engine {
  background-color: rgba(0, 0, 0, 0.3);
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  text-align: center;
  align-items: center;
  justify-content: center;
  user-select: text;
  > div {
    color: colors.$display;
    background: colors.$background;
    border-radius: 6px;
    padding: 16px 20px;
  }
}
</style>
