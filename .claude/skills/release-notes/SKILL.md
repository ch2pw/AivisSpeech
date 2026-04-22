---
name: release-notes
description: AivisSpeech の新バージョンリリース時に updateInfos のリリースノートドラフトを作成・更新するスキル。「リリースノート」「updateInfos」「アップデート情報」「リリース準備」などのキーワードが出たら使う。updateInfos.draft.json の作成・更新、エンジン側リリースノートとの統合、漏れチェックまでを包括的にサポートする。
---

# AivisSpeech リリースノート作成

## 運用ルール

`public/updateInfos.json` は `VITE_LATEST_UPDATE_INFOS_URL` により master ブランチの内容が全ユーザーに配信される。リリース前に更新すると未リリースバージョンの通知が届いてしまうため、ドラフトは必ず `public/updateInfos.draft.json` に作成し、リリースコミット時に `updateInfos.json` へ反映する。

## 調査の進め方

### 1. タグ日付の確認（最優先）

```bash
git tag -l --format='%(refname:short) %(creatordate:iso)' | sort -t' ' -k2
```

前バージョンタグの日付を確認し、`git log <前バージョンタグ>..HEAD` で対象コミットの範囲を確定する。前バージョン以前から存在していた機能を「追加」と記載するミスを防ぐために、これは絶対に最初にやること。

### 2. コミットメッセージだけでなく実際の差分を確認する

コミットメッセージには全ての変更が書かれているとは限らない。以下のサブエージェントを並行起動し、各領域の `git diff <前バージョンタグ>..HEAD` を調査する:

- **ヘルプドキュメント**: `public/howtouse.md`, `public/qAndA.md`, `public/contact.md` 等
- **エディタ UI**: ModelManageDialog, DictionaryManageDialog, PresetManageDialog, Talk/, SettingDialog, MenuBar 等
- **VOICEVOX 由来の変更**: tsukumijima 以外のコミットでソング/シーケンサー/マルチトラック関連を除いたもの
- **前プレビュー版以降の差分**: 直近のプレビュー版タグ以降の変更

### 3. エンジン側リリースノートの統合

AivisSpeech は AivisSpeech Engine を包含する。エンジン側のリリースノート (`../AivisSpeech-Engine/resources/engine_manifest_assets/update_infos.json`) の内容を取り込む。

- エンジン側の変更には `Engine:` プレフィックスを付ける
- エンジン側の API 追加で対応する UI 機能がエディタ側にある場合は、UI 機能として記載する（プレフィックスなし）

### 4. Opus サブエージェントによる漏れチェック

ドラフト完成後、Opus モデルのサブエージェントに全コミットとドラフトを突き合わせてもらい、漏れ・誤りを検出する。

## 記述フォーマット

### 絵文字カテゴリ（この順序で並べる）

- `🚀` : 主要な新機能
- `✨` : 改善・UI/UX 向上
- `⚡` : パフォーマンス改善
- `✅` : 小規模な機能追加
- `🛠️` : バグ修正（末尾に「🛠️ そのほか、様々な不具合を修正」を置く）
- `⬆️` : 依存関係・ベースバージョンの更新

### 項目の並べ方（厳守）

各絵文字カテゴリの中で、**エディタ側の項目を全て先に配置し、`Engine:` プレフィックス付きの項目を全て後に配置する**。`Engine:` 項目の後にエディタ側の項目を挿入してはならない。新しいエディタ側の項目を追加する際は、そのカテゴリ内の最後のエディタ側項目の直後（最初の `Engine:` 項目の直前）に挿入すること。

カテゴリ内では重要度の高い項目を上に配置する。関連する小さな変更は1項目にまとめてよい（例: 括弧書きで列挙）。

### リグレッション修正

プレビュー版ユーザーが多いため、リグレッション修正も全て含める。ただし「リグレッション」という表現は使わない。

### contributors

- tsukumijima 以外の直接 PR 貢献者がいれば個別に記載
- VOICEVOX マージ由来は末尾に `VOICEVOX Contributors` としてまとめる
- `git log <前バージョンタグ>..HEAD --no-merges --format="%an" | sort | uniq -c | sort -rn` で確認

### JSON 構造

```json
[
  {
    "version": "X.Y.Z",
    "descriptions": [
      "🚀 エディタ側の新機能...",
      "🚀 Engine: エンジン側の新機能...",
      "✨ エディタ側の改善...",
      "✨ Engine: エンジン側の改善...",
      "⚡ ...",
      "✅ ...",
      "🛠️ エディタ側のバグ修正...",
      "🛠️ Engine: エンジン側のバグ修正...",
      "🛠️ そのほか、様々な不具合を修正",
      "⬆️ ..."
    ],
    "contributors": ["tsukumijima", "VOICEVOX Contributors"]
  },
  ...既存バージョンのエントリ
]
```

## チェックリスト

- [ ] タグ日付を確認し、対象コミット範囲を正しく設定した
- [ ] 前バージョンに既に存在していた機能を「追加」と誤記していない
- [ ] コミットメッセージだけでなく、実際のファイル差分を確認した
- [ ] ヘルプドキュメントの変更を確認・記載した
- [ ] VOICEVOX 由来コミット（ソング関連除く）を漏れなく確認した
- [ ] エンジン側リリースノートを統合した
- [ ] 各カテゴリ内でエディタ側 → Engine: の並び順を守っている
- [ ] Opus サブエージェントによる漏れチェックを実施した
- [ ] contributors に漏れがない
- [ ] JSON が valid である
- [ ] ドラフトは `updateInfos.draft.json` に保存し `updateInfos.json` は未変更
