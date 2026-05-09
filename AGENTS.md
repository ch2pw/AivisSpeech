# AivisSpeech エージェント作業指針

AivisSpeech は VOICEVOX エディターを upstream として継続追従している Electron / Vue アプリです。  
このリポジトリでは、局所的にきれいな変更よりも、upstream との差分を不用意に広げず、将来のマージ可能性を保つことを優先してください。

## 基本方針

- 変更前に、該当コードが AivisSpeech 固有実装なのか、VOICEVOX 由来の upstream コードなのかを確認します。
- upstream 由来のコードは、明確な必要がない限り構造変更・リファクタリング・削除を避けます。
- 未使用に見えるコード、コメントアウトされたコード、Linux 向けの無効化された処理、古いドキュメントは、将来の upstream 追従や対応再開のために意図的に残されている可能性があります。
- 「不要そうだから削除する」「ついでに整理する」「一貫していないので全面的に直す」といった変更は避けます。
- 既存コメントには設計意図や歴史的経緯が含まれていることがあります。古く見えても、削除より更新・補足を優先します。
- 仕様を増やす場合は、通常利用者向けの仕様と、開発・検証専用の仕様を明確に分けます。開発用の環境変数やモードは最小限にしてください。

## upstream 追従

- VOICEVOX からの移植・追従を容易にするため、upstream と同じファイル構造・命名・処理の流れをできるだけ維持します。
- AivisSpeech 固有の都合で upstream と違う処理を入れる場合は、差分の範囲を小さくし、周辺の upstream コードを巻き込まないでください。
- upstream 側に由来する不自然な設計、重複、古い実装、パッチワーク的な処理があっても、AivisSpeech の要件に直接影響しない限り修正対象にしません。
- ブランド名の置換は必要箇所に限定します。VOICEVOX 由来であること自体に意味がある表示、コメント、型名、互換機能名を機械的に置換しないでください。
- AivisSpeech で現在使っていない機能でも、upstream 追従のために残している場合があります。削除や大規模な無効化を行う前に必ず確認してください。

## Git と作業範囲

- ユーザーの明示的な指示がない限り、`git add`、`git reset`、`git restore`、`git checkout`、`git commit`、`git clean` を実行しないでください。
- 作業ツリーに既存変更がある場合は、それをユーザーの作業として扱い、巻き戻したり整形し直したりしないでください。
- 依頼された問題に直接関係するファイルだけを触ります。周辺の気になる点は、必要なら提案として報告します。
- ファイル削除は、たとえ一時ファイルや生成物に見えても、ユーザーの許可なしに行わないでください。
- コミットメッセージや履歴を確認する必要がある場合は、既存の書式・言語・粒度に合わせます。

## CI とビルド

- このプロジェクトの製品ビルドはローカル実行を前提にしていません。CI の build pipeline が実際の製品ビルド手順です。
- `.github/workflows/build.yml` は複雑ですが、upstream 由来の構造や将来復帰予定の処理が混在しています。整理目的で job、matrix、コメントアウトされた Linux 処理を削除しないでください。
- `upload_artifact` はデバッグ用成果物アップロードのスイッチです。ただし、後続の `test-updater-e2e` job が必要とする最小限の app artifact（Windows / macOS の zip）は、このスイッチに関わらず常にアップロードされる設計になっています。
- build と E2E は責務を分けます。製品に近い E2E は、build job が作った artifact を後続 job でダウンロードして実行する形を優先します。
- `setup-environment` action の中で pnpm / Node / install が扱われます。CI で pnpm を直接使う job を追加する場合は、既存の setup pattern を確認してください。
- Windows / macOS / Linux の分岐は将来対応や upstream 追従のために残されていることがあります。現時点で無効でも、勝手に消さないでください。

## テスト

- README にある通り、既存テストの多くは AivisSpeech 向けに十分維持されていません。全 unit / E2E が常に信頼できる前提で判断しないでください。
- 直近で追加・修正した機能に専用の narrow test script がある場合、その script に関連テストを明示的に含めます。
- `test-updater:unit` は、壊れがちな既存 unit 全体を避けつつ、アップデート機能に関係する直近の unit test だけを CI で回すための script です。アップデート機能の unit spec を追加したら、ここに入れるかを必ず検討してください。
- updater の E2E は、可能な限り packaged app と実際の nightly asset に近い条件で検証することを重視します。dev server だけで確認して終わらせないでください。
- Electron E2E や updater test は OS 依存です。Windows と macOS で実際に通る処理か、CI matrix と artifact 名まで確認してください。
- ローカルの Codex サンドボックスでは、`127.0.0.1` や `::1` にテストサーバーを立てる処理が `listen EPERM` で失敗することがあります。その場合は実装不具合と断定せず、環境制限として扱ってください。
- テスト名や説明は、既存の日本語テストの粒度に合わせます。何を保証するテストかが読める名前にしてください。

## updater 実装

- アップデート機能はユーザーの更新適用率に直結するため、実際の通知表示、ダウンロード、インストーラー起動に近い経路を優先して検証します。
- 現在は `electron-updater` は使用せず、`UpdateManager` クラス (`src/backend/electron/updateManager.ts`) による独自の HTTP ダウンロード実装を採用しています。`electron-updater` の組み込み機能へ寄せる変更は、Windows NSIS 周辺や CI を大きく変える可能性があるため、簡単な置換として扱わないでください。
- 開発・検証用の updater 差し替えは、環境変数を増やしすぎないことを優先します。現行の検証用入口は `AIVISSPEECH_UPDATE_TEST_URL` です。
- 通常の update info URL と installer URL の解決は、packaged app で効く場所に置きます。renderer だけで完結する `import.meta.env` と、main process の `process.env` の違いを確認してください。
- テストサーバー側で吸収できる複雑さは、アプリ本体の仕様に持ち込まないでください。例として、テスト用バージョン `9999.0.0`（`src/domain/updateDownload.ts` で定義、テスト文脈でのみ使用）、GitHub Releases API からの最新 `*-dev` prerelease 選択、asset proxy は test server 側に閉じ込めます。
- CI では `CI=true` など GitHub Actions の標準環境を活用し、AivisSpeech 固有のテスト用環境変数を増やす前に代替できないか確認してください。

## Electron 境界

- renderer、preload、main process の境界を必ず確認します。packaged renderer で Node globals が使えるとは限りません。
- OS / arch 判定、ファイルシステム操作、外部プロセス起動、shell open は main process または preload 経由に寄せるのが基本です。
- browser build の sandbox stub は、未対応機能を投げることがあります。backend stub があるだけで十分と考えず、UI 側で未対応 action を出していないか確認してください。
- IPC を増やす場合は、`src/type/ipc.ts`、preload 型、browser sandbox、Electron preload、main handler の整合を確認します。

## コーディング

- 既存のスタイルを優先します。TypeScript / Vue では周辺の import 順、命名、コメント量、Quasar component の書き方に合わせてください。
- 文字列リテラルは周辺がダブルクォートならダブルクォート、シングルクォートならシングルクォートに合わせます。この repo では TypeScript 側にダブルクォートが多くあります。
- utility 関数を追加する場合は JSDoc / TSDoc を書きます。引数と戻り値が読める粒度にしてください。
- ログメッセージは英語で書きます。ユーザー向け UI 文言やコメントは既存の日本語表現に合わせます。
- acronym は表記を崩さないでください。`E2E`、`CI`、`API`、`DMG` などを `E2e` のように書かないでください。
- script 名や job 名は既存の命名順に合わせます。新しい名前を足す前に `package.json` と workflow 内の既存 pattern を確認してください。
- 過剰な一般化を避けます。1 つの検証専用処理に複数の環境変数、抽象化、設定層を足す前に、1 つの入口で足りないか確認してください。

## ドキュメント

- README や docs の多くは upstream 由来で、AivisSpeech の現状と一致しない箇所があります。ドキュメントだけを根拠に実装判断をしないでください。
- ただし README の「開発方針」は、この repo の重要な前提です。upstream 追従、削除回避、テストの扱いに関する判断では必ず尊重してください。
- ドキュメント更新が必要な場合は、AivisSpeech 固有の最新情報として追加するのか、upstream 由来文書に手を入れるのかを分けて考えてください。

## 依存関係と外部情報

- 依存関係のバージョンや build tool の変更は、必要性を確認してから最小限にします。
- GitHub Actions、Electron、Playwright、electron-builder などの挙動が原因に見える問題は、最新の公式情報や現行コードを確認してから判断してください。
- AivisSpeech Engine との連携が絡む場合は、editor 側だけで完結していると決めつけず、Engine artifact、配置先、起動パス、CI の download action を確認します。

## 作業後の確認

- 変更対象に対応する最小の script をまず実行します。
- updater 関連なら、少なくとも `pnpm run test-updater:unit` の対象に入るべき unit test が漏れていないか確認してください。
- 型境界や preload / IPC を触った場合は `pnpm run typecheck` を実行します。
- lint 対象が明確なら、全体 lint の前に対象ファイルへ `pnpm exec eslint <files>` を実行します。
- 実行できない検証がある場合は、コマンド、失敗理由、環境制限か実装不具合かを区別して報告してください。
