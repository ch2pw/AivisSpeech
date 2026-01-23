import { beforeEach, expect, test } from "vitest";
import { store } from "@/store";
import { commandHistory } from "@/store/command";
import { AudioKey } from "@/type/preload";
import { resetMockMode, uuid4 } from "@/helpers/random";
import { cloneWithUnwrapProxy } from "@/helpers/cloneWithUnwrapProxy";

const initialState = cloneWithUnwrapProxy(store.state);
beforeEach(() => {
  store.replaceState(initialState);

  // commandHistory は Vuex state から分離されているため、個別にリセットする
  commandHistory.undoCommands.talk.splice(0);
  commandHistory.undoCommands.song.splice(0);
  commandHistory.redoCommands.talk.splice(0);
  commandHistory.redoCommands.song.splice(0);

  resetMockMode();
});

test("コマンド実行で履歴が作られる", async () => {
  await store.dispatch("COMMAND_SET_AUDIO_KEYS", {
    audioKeys: [AudioKey(uuid4())],
  });
  const { audioKeys } = store.state;
  const { undoCommands, redoCommands } = commandHistory;
  expect({ audioKeys, redoCommands, undoCommands }).toMatchSnapshot();
});
