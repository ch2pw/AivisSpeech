import { reactive, toRaw } from "vue";
import { enablePatches, enableMapSet, Immer } from "immer";

import { Command, CommandStoreTypes, State } from "./type";
import { applyPatches } from "@/store/immerPatchUtility";
import {
  createPartialStore,
  Mutation,
  MutationsBase,
  MutationTree,
} from "@/store/vuex";
import { CommandId, EditorType } from "@/type/preload";
import { uuid4 } from "@/helpers/random";
import { objectEntries, objectFromEntries } from "@/helpers/typedEntries";

enablePatches();
enableMapSet();

const immer = new Immer();
immer.setAutoFreeze(false);

export type PayloadRecipe<S, P> = (draft: S, payload: P) => void;
export type PayloadRecipeTree<S, M> = {
  [K in keyof M]: PayloadRecipe<S, M[K]>;
};

/**
 * レシピをプロパティに持つオブジェクトから操作を記録するMutationをプロパティにもつオブジェクトを返す関数
 * @param payloadRecipeTree - レシピをプロパティに持つオブジェクト
 * @returns Mutationを持つオブジェクト(MutationTree)
 */
export const createCommandMutationTree = <S, M extends MutationsBase>(
  payloadRecipeTree: PayloadRecipeTree<S, M>,
  editor: EditorType,
): MutationTree<S, M> =>
  objectFromEntries(
    objectEntries(payloadRecipeTree).map(([key, val]) => [
      key,
      // @ts-expect-error とりあえず動くので無視
      createCommandMutation(val, editor),
    ]),
  ) as MutationTree<S, M>;

/**
 * 与えられたレシピから操作を記録し実行後にStateに追加するMutationを返す。
 * @param payloadRecipe - 操作を記録するレシピ
 * @returns レシピと同じPayloadの型を持つMutation.
 */
export const createCommandMutation =
  <S extends State, M extends MutationsBase, K extends keyof M>(
    payloadRecipe: PayloadRecipe<S, M[K]>,
    editor: EditorType,
  ): Mutation<S, M, K> =>
    (state: S, payload: M[K]): void => {
      const command = recordPatches(payloadRecipe)(state, payload);
      applyPatches(state, command.redoPatches);
      commandHistory.undoCommands[editor].push(command);
      commandHistory.redoCommands[editor].splice(0);
    };

/**
 * @param recipe - 操作を記録したいレシピ関数
 * @returns Function - レシピの操作を与えられたstateとpayloadを用いて記録したコマンドを返す関数。
 */
const recordPatches =
  <S, P>(recipe: PayloadRecipe<S, P>) =>
    (state: S, payload: P): Command => {
      const [, doPatches, undoPatches] = immer.produceWithPatches(
      toRaw(state),
      (draft: S) => recipe(draft, payload),
    );
      return {
        id: CommandId(uuid4()),
        redoPatches: doPatches,
        undoPatches: undoPatches,
      };
    };

// コマンド履歴を Vuex state から分離し、モジュールスコープの reactive 変数として管理する
// これにより、Immer の produceWithPatches に渡される state から履歴データが除外され、
// 履歴が蓄積してもパフォーマンスが劣化しなくなる
// Vue の reactive() でラップしているため、getter 内からの参照でもリアクティブ性が維持される
export const commandHistory = reactive<{
  undoCommands: Record<EditorType, Command[]>;
  redoCommands: Record<EditorType, Command[]>;
}>({
  undoCommands: {
    talk: [],
    song: [],
  },
  redoCommands: {
    talk: [],
    song: [],
  },
});

export const commandStoreState = {};

export const commandStore = createPartialStore<CommandStoreTypes>({
  CAN_UNDO: {
    getter: () => (editor: EditorType) => {
      return commandHistory.undoCommands[editor].length > 0;
    },
  },

  CAN_REDO: {
    getter: () => (editor: EditorType) => {
      return commandHistory.redoCommands[editor].length > 0;
    },
  },

  UNDO: {
    mutation(state, { editor }) {
      const command = commandHistory.undoCommands[editor].pop();
      if (command != null) {
        commandHistory.redoCommands[editor].push(command);
        applyPatches(state, command.undoPatches);
      }
    },
    action({ mutations, actions }, { editor }: { editor: EditorType }) {
      mutations.UNDO({ editor });
      if (editor === "song") {
        // TODO: 存在しないノートのみ選択解除、あるいはSELECTED_NOTE_IDS getterを作る
        mutations.DESELECT_ALL_NOTES();
        void actions.SYNC_TRACKS_AND_TRACK_CHANNEL_STRIPS();
        void actions.RENDER();
      }
    },
  },

  REDO: {
    mutation(state, { editor }) {
      const command = commandHistory.redoCommands[editor].pop();
      if (command != null) {
        commandHistory.undoCommands[editor].push(command);
        applyPatches(state, command.redoPatches);
      }
    },
    action({ mutations, actions }, { editor }: { editor: EditorType }) {
      mutations.REDO({ editor });
      if (editor === "song") {
        // TODO: 存在しないノートのみ選択解除、あるいはSELECTED_NOTE_IDS getterを作る
        mutations.DESELECT_ALL_NOTES();
        void actions.SYNC_TRACKS_AND_TRACK_CHANNEL_STRIPS();
        void actions.RENDER();
      }
    },
  },

  LAST_COMMAND_IDS: {
    getter() {
      const getLastCommandId = (commands: Command[]): CommandId | null => {
        if (commands.length == 0) return null;
        else return commands[commands.length - 1].id;
      };

      return {
        talk: getLastCommandId(commandHistory.undoCommands["talk"]),
        song: getLastCommandId(commandHistory.undoCommands["song"]),
      };
    },
  },

  CLEAR_COMMANDS: {
    mutation() {
      for (const editor of ["talk", "song"] as const) {
        commandHistory.undoCommands[editor].splice(0);
        commandHistory.redoCommands[editor].splice(0);
      }
    },
  },
});
