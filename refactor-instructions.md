# refactor-instructions.md — Extension Scanner リファクタリング指示書

- 作成日: 2026-06-13
- 対象リポジトリ: `extension-scanner`(Chrome Manifest V3 拡張機能、TypeScript + Vite)
- 対象コミット: `7925340`(main、作業ツリーはクリーン)
- 読者: 実装担当モデル(Codex / Opus 等)と人間レビュアー
- 根拠: 全ソースの精読、`npm run build` / `npx tsc --noEmit` の実行結果、52件の負債候補に対する独立検証(全件 file:line の証拠つきで確認済み)

---

## Objective

既存の挙動を壊さずに、このリポジトリの技術的負債を減らし、変更しやすい状態にする。

このリファクタリングのゴールは次の3つ。

1. **検証基盤を作る**。現在、テスト・lint・型チェックのゲートが一切ない。型チェックは現時点で失敗している。
2. **検出パイプラインの信頼性バグを直す**。本ツールの核である「悪意ある拡張の検出」が、複数の経路で無言で無効化される。
3. **規約違反と重複を解消する**。CLAUDE.md が定める規約(ストレージアクセスは `store.ts` 経由など)に違反するコードを規約に合わせる。

見た目の綺麗さは目的ではない。スコアリング結果やUIの見た目を変えることも目的ではない。**「無言で壊れる」箇所を「明示的に失敗する・ログが残る・テストで検知できる」状態にすることが目的**である。

---

## Project Understanding

### このプロジェクトは何か

インストール済みのChrome拡張機能を解析し、悪意ある可能性をスコアリングして「red / yellow / green」に分類するセキュリティ拡張機能。Chrome Web Store 配布を想定し、GitHub Actions でリリースZIPを作る。

### 主要なユーザー体験

1. インストール時・起動時・60分ごと・拡張の増減時に自動スキャンが走る。
2. ツールバーバッジに脅威数が表示される(red>0 → 赤+件数、yellow>0 → 黄+件数、それ以外 → 緑 "OK")。
3. ポップアップで概要(red/yellow/green件数と脅威リスト)を確認し、「Scan Now」で即時スキャン、「Full Report」でダッシュボードを開く。
4. ダッシュボードで全拡張の詳細(スコア内訳、権限、アクション)を確認する。
5. 新しい高リスク拡張が現れるとデスクトップ通知が出る。

### エントリーポイントとモジュール責務

| パス | 責務 |
|---|---|
| `src/background/service-worker.ts` | 全イベントリスナー登録(MV3要件によりトップレベルで同期登録)、スキャンとブロックリスト更新の調整、popup/dashboard からのメッセージ処理 |
| `src/scoring/engine.ts` | `scoreExtension()`(1拡張を全ルールで評価)、`runFullScan()`(全拡張スキャン+分類)、閾値: red ≥70 / yellow ≥30 / green <30 |
| `src/scoring/rules/*.ts` | `ScoringRule` インターフェース実装。blocklist(100点) / permissions / host-permissions / install-type / metadata の5ルール |
| `src/data/blocklist-fetcher.ts` | GitHub raw URL からブロックリスト取得、`chrome.storage.local` に24時間TTLでキャッシュ |
| `src/data/blocklist-fallback.ts` | オフライン用フォールバック(**現在は空のMap**) |
| `src/data/permission-weights.ts`, `suspicious-patterns.ts` | スコアリング用データテーブル |
| `src/storage/store.ts` | `chrome.storage.local` アクセスのヘルパー(`STORAGE_KEYS` 定数、`saveScanResult`/`loadScanResult`/`loadPreferences`/`savePreferences`) |
| `src/alerts/notifier.ts` | バッジ更新と新規脅威の通知 |
| `src/popup/popup.ts`, `src/dashboard/dashboard.ts` | UI。service worker とメッセージ(`GET_SCAN_RESULT` / `RUN_SCAN` / `OPEN_DASHBOARD`)でやり取り |
| `src/shared/types.ts`, `constants.ts`, `utils.ts` | 共有型(`ScoredExtension`、`ScanResult`、`UserPreferences`)、定数、`timeAgo()` |
| `vite.config.ts` | ビルド設定。カスタム `flattenHtmlPlugin` がHTMLを `dist/` 直下に移動しパスを書き換える |

### データフロー

```
イベント(install/startup/alarm/management/RUN_SCANメッセージ)
  → initBlocklist(): getBlocklist()(キャッシュ or fetch) → setBlocklistData()(blocklistルールのモジュール変数へ)
  → performScan(): runFullScan()(全ルール評価) → saveScanResult()(storage)
      → updateBadge() → notifyNewThreats()(前回結果とのID差分で通知)
popup/dashboard → sendMessage → service worker → storage の結果を返す
```

### 外部依存

- **実行時のネットワーク依存は2つだけ**:
  1. ブロックリスト取得: `https://raw.githubusercontent.com/nicoleahmed/chrome-mal-ids/refs/heads/main/mal-ids.json`(`src/shared/constants.ts:16-17`)— **2026-06-13時点で404**(後述 A-1)
  2. popup の Google Fonts 読み込み(`src/popup/popup.html:6-11`)
- ビルド依存: `vite@^5`、`typescript@^5.9`、`chrome-types@^0.1.415`(devDependenciesのみ。ランタイム依存はゼロ)
- CI: `.github/workflows/release.yml`(`v*` タグ push 時のみ。ビルドとリリースZIP作成のみで、テスト・型チェックは無い)

### 検証コマンド(現状)

`npm run build`(vite ビルド)と `npm run dev`(watch)のみ。テスト・lint・typecheck のスクリプトは存在しない。

---

## Behaviors To Preserve

以下は**承認なしに変えてはいけない既存挙動**。Phase 1 の特性テストでこれらを固定してから作業すること。

1. **スコアリング出力**: 同じ入力(拡張のメタデータ+同じブロックリスト)に対する `scoreExtension()` の `totalScore`・`ruleResults`・`riskLevel` は不変。重み(`permission-weights.ts`)、閾値(`THRESHOLDS.RED=70` / `YELLOW=30`)、各ルールのロジックを変えない。
2. **リスク分類**: green <30、yellow 30–69、red ≥70(`engine.ts:36-40`)。
3. **スキャン対象**: `type === "extension"` かつ自分自身(`chrome.runtime.id`)を除外(`engine.ts:46-48`)。無効化済み拡張も対象に含む。
4. **ストレージ互換**: `chrome.storage.local` のキー(`lastScanResult` / `userPreferences` / `blocklistCache` / `blocklistUpdatedAt`)と、**旧バージョンが書いた既存データが読めること**。
5. **メッセージプロトコル**: `GET_SCAN_RESULT` / `RUN_SCAN` / `OPEN_DASHBOARD` の文字列値と応答の形(`ScanResult | null`)。
6. **バッジ挙動**: red>0 → 赤背景+red件数、それ以外で yellow>0 → 黄+yellow件数、どちらも0 → 緑 "OK"(`notifier.ts:4-17`)。
7. **通知条件(現行)**: 前回スキャン結果に存在しなかったIDのみ対象。red は `notifyOnNewRedExtension`(デフォルトtrue)、yellow は `notifyOnNewYellowExtension`(デフォルトfalse)でゲート(`notifier.ts:19-52`)。
8. **アラーム**: `periodic-scan` 60分、`blocklist-update` 24時間(`constants.ts:6-7`)。
9. **MV3 制約**: すべてのイベントリスナーは service worker モジュールのトップレベルで同期登録する。async コールバック内での動的登録は禁止。
10. **dist 出力構造**: `dist/` 直下に `service-worker.js` / `popup.html` / `dashboard.html` / `manifest.json` / `icons/`、`dist/assets/` にCSS、`dist/chunks/` に共有チャンク。`public/manifest.json` が参照するファイル名と一致が必須。
11. **UI挙動**: popup は red/yellow のみ列挙、dashboard は全件+フィルタ+検索。ブロックリストキャッシュのTTL(24時間)とフォールバック順(キャッシュ→フォールバック)。

---

## Non-Negotiables

1. **最初に `git status` を確認する**。未コミットの変更があれば、それに触れず、自分の変更と混ぜない。
2. **編集前にベースラインの検証結果を記録する**(Baseline Commands 参照)。
3. **変更は小さく、戻しやすい単位でコミットする**。1コミット=1つの論理的変更。フェーズをまたぐコミットを作らない。
4. **無関係な整形・リネーム・「ついで」のリファクタリングをしない**。差分は意図した変更だけにする。
5. **既存挙動を勝手に変えない**。挙動変更が許されるのは、Debt Map で「実装可」とされたバグ修正のみ。
6. **正しさが不明な場合は実装を止めて質問する**(Stop And Ask Conditions 参照)。
7. **各フェーズの最後に検証してから次へ進む**。検証が失敗したまま次のフェーズに進まない。
8. **ランタイム依存を追加しない**。devDependencies の追加は Phase 1 の vitest(+必要なら @types 系)のみ許可。それ以外は質問する。
9. **`public/manifest.json` の `permissions` を変更しない**。
10. **新しいネットワーク接続先を追加しない**(Q1 の回答で指定された場合を除く)。
11. **TypeScript の strict 設定(`strict` / `noUncheckedIndexedAccess`)を緩めない**。型エラーは設定変更ではなくコード修正で解消する。
12. **証拠なく削除しない**。「使われていない」と判断する場合は、必ず `grep` で全使用箇所を確認し、その結果をコミットメッセージか報告に残す。

---

## Stop And Ask Conditions

次のいずれかに該当したら、**実装を止めて人間に質問する**。

1. スコアの数値・重み・閾値・riskLevel 分類を変えたくなったとき(Debt Map で「提案のみ」とされた項目すべて)。
2. `chrome.storage.local` に保存されるデータの**形**を変える必要が出たとき(キー追加は可、既存フィールドの削除・意味変更は不可)。
3. 通知の発火条件を、Debt Map で承認された範囲を超えて変えたくなったとき。
4. `public/manifest.json` を変更したくなったとき。
5. テストを書いて実装と仕様(README / CLAUDE.md)の矛盾を見つけたとき。**テストを実装に合わせて黙って書き換えない**。矛盾を報告して指示を待つ。
6. 削除候補のコードが本当に不要か確信が持てないとき。
7. ブロックリストの取得先URL・データ形式を変えるとき(Q1 未回答の間は禁止)。
8. このドキュメントの記述と実際のコードが食い違っているとき(コードが変わった可能性がある。報告して確認する)。
9. 後述の「未解決の質問」のうち**ブロッカー(Q1・Q2)に依存する作業**に着手する前(回答がなければ Phase 6 はすべてスキップし、提案文書だけ書く)。

---

## Baseline Commands

作業開始時に以下を実行し、結果を最初の報告に記録すること。2026-06-13 時点の期待結果を併記する。

```bash
git status            # 期待: clean(そうでなければ報告し、混ぜない)
npm ci                # 期待: 成功
npm run build         # 期待: 成功。dist/ 直下に service-worker.js, popup.html,
                      #       dashboard.html, manifest.json, icons/, assets/, chunks/
npx tsc --noEmit      # 期待(修正前): 8エラー/4箇所 — popup.ts:161,168 と
                      #   dashboard.ts:245,281 の chrome.runtime.sendMessage
                      #   コールバック形式が overload 不一致(TS2769, TS7006)
```

- この型エラーは**既知のベースライン**。Phase 2 で解消する。これ以外の型エラーが出たら、環境差分の可能性があるので報告する。
- 注意: `vite build` は型チェックを行わない。ビルド成功は型の健全性を意味しない。
- テストは存在しない(`npm test` は未定義)。

---

## Debt Map

各項目の「扱い」は次の3種類。

- **実装可**: このドキュメントの承認範囲内で実装してよい(該当フェーズで行う)
- **提案のみ**: 実装せず、修正案を文書化して人間の承認を待つ
- **質問**: 「未解決の質問」の回答が出るまで実装しない

### カテゴリA: 検出パイプラインの信頼性(最優先)

#### A-1. ブロックリスト取得先URLが死んでいる(404)— 100点ルールが本番で無効 ⚠️最重要

- **根拠**: `src/shared/constants.ts:16-17` の `BLOCKLIST_SOURCE_URL` は 2026-06-13 時点で **HTTP 404**(リポジトリ `nicoleahmed/chrome-mal-ids` が消滅。後継は `The-Privacy-Commons-Institute/chrome-mal-ids` だが配布形式が STIX/MISP に変わっている)。fetch 失敗は `blocklist-fetcher.ts:29-33,46-50` の裸 catch で無言に握りつぶされ、キャッシュが無ければ `blocklist-fallback.ts:3-9` の**空のMap**にフォールバックする。
- **なぜ負債か**: 本ツール最強の検出シグナル(blocklist一致=100点/critical)が、エラーも警告も出さずに恒久的に無効化されている。
- **影響範囲**: 検出精度の根幹。既知の悪意ある拡張がインストールされていても green と判定され得る。
- **変更リスク**: 取得先の変更はデータ形式・信頼モデルの判断を伴う(高)。一方、失敗の可視化だけなら低。
- **改善案**: 取得先と形式は **Q1 の回答待ち**。回答前にできる安全な修正: ①catch でのログ出力(B-3)、②空リスト・形状不正を成功扱いしない(A-4)、③ブロックリストの取得状態(最終成功時刻・件数)を保存してダッシュボードに出せるようにする土台。
- **検証**: 単体テストで「fetch失敗時に既存キャッシュを温存し、エラーがログされる」ことを確認。
- **扱い**: URL差し替え=**質問(Q1)**。失敗の可視化=**実装可**(Phase 4)。

#### A-2. SW再起動後の onEnabled/onDisabled/onUninstalled スキャンで blocklist ルールが無効

- **根拠**: `blocklist.ts:5` はリストをモジュール変数(`let cachedBlocklist = null`)に持ち、`blocklist.ts:22` は未初期化なら `[]` を返す。初期化は `service-worker.ts:91-94` の `initBlocklist()` のみ。しかし `management.onUninstalled / onEnabled / onDisabled`(`service-worker.ts:58-66`)は `initBlocklist()` を呼ばずに `performScan()` する。MV3 では SW が頻繁に終了するため、これらのイベントで起きたスキャンは blocklist ルール無効のまま実行され、`saveScanResult()` が保存結果とバッジを**低いスコアで上書き**する。
- **なぜ負債か**: `setBlocklistData()` と `runFullScan()` の暗黙の時間的結合をコードが保証していない。red だった拡張が無言で green に変わり得る。
- **影響範囲**: 保存される ScanResult、バッジ、ダッシュボード表示。
- **変更リスク**: 低。`performScan()` の先頭に `await initBlocklist()` を足すのは加算的(キャッシュTTL内ならネットワークアクセスなし)。
- **改善案**: `performScan()` の最初で `await initBlocklist()` を呼ぶ。各呼び出し元の明示的な `initBlocklist()` は冗長になるが無害(削除してもよい)。
- **検証**: 単体テストでは「blocklist 未設定で evaluate が空を返す」現挙動を固定した上で、SW のコードパスを目視確認。手動では SW を停止→他拡張の有効/無効切替→`lastScanResult` に blocklist-match が残ることを確認。
- **扱い**: **実装可**(Phase 4)。

#### A-3. blocklist-update アラームが取得結果を捨てる

- **根拠**: `service-worker.ts:48-50` は `await refreshBlocklist()` の戻り値を捨て、`setBlocklistData()` も `performScan()` も呼ばない。新しいリストが検出に反映されるのは最大60分後の `periodic-scan` 経由のみ(それも `getBlocklist()` がキャッシュを再読込するから動くという偶然による)。
- **なぜ負債か**: アラームの目的(新しい悪意IDの反映)をハンドラ自身が達成していない。periodic-scan の実装が変わると無言で壊れる。
- **影響範囲**: 新規ブロックリスト掲載の反映遅延(最大1時間)。意図の不明瞭さ。
- **変更リスク**: 低。再スキャンの追加は文書化された意図(CLAUDE.md「Coordinates blocklist updates and threat detection」)に一致する。
- **改善案**: `const fresh = await refreshBlocklist(); setBlocklistData(fresh); await performScan();`
- **検証**: 手動で `chrome.alarms.create('blocklist-update', {when: Date.now()})` を発火し、`lastScanResult` が即時更新されることを確認。
- **扱い**: **実装可**(Phase 4)。

#### A-4. fetch 結果の検証なし — 空・形状不正を「成功」として24時間キャッシュし、正常キャッシュを上書き

- **根拠**: `blocklist-fetcher.ts:61-73` は `Array.isArray(data)` でなければ(または空配列なら)**空のMapを正常結果として返し**、`saveCachedBlocklist()`(102-114行)が直前まで正常だったキャッシュを上書きする。サイズ上限もない。
- **なぜ負債か**: 上流のフォーマット変更・空応答一発で、blocklist ルールが24時間×恒久的に無効化される。失敗と成功の区別がない。
- **影響範囲**: 検出精度、キャッシュの健全性。
- **変更リスク**: 低〜中。「空リストはエラー扱い」は妥当だが、上流が本当に空を配る正当なケースを潰す(実運用上は空=異常とみなしてよい)。
- **改善案**: パース結果が0件、または配列でない場合は throw してエラー経路(キャッシュ温存→フォールバック)に乗せる。応答サイズに上限(例: 5MB)を設ける。パース部分を純関数 `parseBlocklist(data: unknown): Map<...>` として抽出し単体テスト可能にする。
- **検証**: 単体テスト — 正常配列 / 空配列 / オブジェクト / 文字列混在配列 の各ケース。空・不正で既存キャッシュが残ること。
- **扱い**: **実装可**(Phase 4)。

#### A-5. ルール単位のフォールト分離なし — 1ルールの例外で全スキャン中断

- **根拠**: `engine.ts:8` の `allRules.flatMap((rule) => rule.evaluate(ext))` に try/catch がなく、例外は `performScan()`(`service-worker.ts:96-104`)まで貫通してスキャン全体を中断する。現行5ルールは防御的で実際には throw しないが、CLAUDE.md は「新ルールの追加」を明示的に推奨しており、将来のルール1つのバグで検出全体が止まる。
- **なぜ負債か**: 拡張を前提に設計されたルールシステムが、ルールを無謬として扱っている。失敗モードが「全滅・無言」。
- **影響範囲**: 全スキャン経路。
- **変更リスク**: 低。throw しない限り出力は同一。**注意**: catch して継続すると「一部ルール欠落の低いスコア」が保存される(fail-open)ため、catch 時は `console.error` で大きくログし、可能なら info 重大度の「rule failed」RuleResult を残す。
- **改善案**: `scoreExtension()` 内で各 `rule.evaluate()` を try/catch で包み、失敗ルールはログして継続。
- **検証**: 単体テスト — throw するダミールールを混ぜても他ルールの結果が得られること。throw しない場合の出力が修正前と同一であること。
- **扱い**: **実装可**(Phase 4)。

#### A-6. performScan の並行実行と「Disable Extension」での二重スキャン

- **根拠**: `dashboard.ts:199-202` は disable 後に `btnScan.click()` で再スキャンを起こすが、`chrome.management.setEnabled()` 自体が SW の `onDisabled`(`service-worker.ts:64-66`)を発火させるため二重スキャンになる。また、複数の management イベントが重なると `performScan()`(96-104行)が並行実行され、`loadScanResult`/`saveScanResult` の read-modify-write が交錯して結果の上書き順や通知の重複が起き得る。
- **なぜ負債か**: 非決定的な保存順・通知重複の温床。
- **影響範囲**: 保存結果の整合性、通知。実害の頻度は低いが再現困難なバグになる型。
- **変更リスク**: 低〜中。in-flight ガード(実行中ならスキップ or 完了を待って合流)は挙動をほぼ変えないが、スキャンの「回数」は減る。
- **改善案**: ①SW 内に「実行中 Promise を共有する」ガードを置く(モジュール変数で可。SW 終了でリセットされても安全側)。②dashboard の `btnScan.click()` 呼び出しを削除し、`onDisabled` 経由の自動再スキャンに任せる(UI 更新は RUN_SCAN 応答 or 再取得で行う)。
- **検証**: 手動 — Disable 押下でスキャンが1回だけ走ること(SW コンソールのログで確認)。単体では困難なので統合的に確認。
- **扱い**: **実装可**(Phase 4)。②は UI 更新タイミングが変わるため、変える場合は RUN_SCAN を1回だけ送る形に整理する。

#### A-7. 通知がID差分のみ — リスク昇格は通知されず、Dismiss/Allowlist はほぼ無機能

- **根拠**: `notifier.ts:27` の `if (previousIds.has(ext.id)) continue;` が dismissed/allowlist チェック(28-29行)より先に走るため、既にインストール済みの拡張には設定が一切効かない(アンインストール→再インストールの場合のみ有効)。また、既存拡張が green→red に昇格しても(例: ブロックリスト更新後)通知されない。さらに `engine.ts` / バッジ / popup / dashboard はこれらのリストを一切読まないため、「Add to Allowlist」「Dismiss」ボタン(`dashboard.ts:198-225`)は押しても**見た目に何も起きない**。
- **なぜ負債か**: セキュリティ製品のユーザー向け制御が無言の no-op。仕様がコードからもドキュメントからも判断できない。
- **影響範囲**: 通知の正確さ、ユーザーの信頼、userPreferences の死蔵状態。
- **変更リスク**: 中〜高。allowlist をスコアやバッジに反映する設計は「誤って allowlist した悪意ある拡張を隠す」リスクを伴うプロダクト判断。
- **改善案**: セマンティクス決定後(Q2)、1箇所(エンジン後段のフィルタ or notifier)で一貫実装し、UI に状態表示と undo を付ける。
- **検証**: セマンティクス確定後にテストを書く。
- **扱い**: **質問(Q2)**。Phase 6。

#### A-8. onStartup のコメント「ensure alarms exist」が実装されていない

- **根拠**: `service-worker.ts:36-40` のコメントは「アラームの存在を保証する」と言うが、実装は `initBlocklist()`+`performScan()` のみで、アラームの確認・再作成をしない。アラーム作成は `onInstalled`(24-29行)だけ。
- **なぜ負債か**: コメントと実装の乖離。アラームが何らかの理由で消えた場合(Chrome の不具合・プロファイル復元等)、次の install/update まで定期スキャンが止まる。
- **影響範囲**: 定期スキャンの継続性(エッジケース)。
- **変更リスク**: 低。`chrome.alarms.get()` で存在確認し、無ければ同じパラメータで作るのはべき等。
- **改善案**: onStartup でアラーム2種を確認・再作成するヘルパーを呼ぶ(リスナー登録自体はトップレベル同期のまま)。
- **検証**: 手動 — SW コンソールで `chrome.alarms.clearAll()` →ブラウザ再起動→ `chrome.alarms.getAll()` で2つ復活していること。
- **扱い**: **実装可**(Phase 4)。

### カテゴリB: エラー処理と失敗経路

#### B-1. onMessage の promise チェーンに .catch がない — 失敗すると popup が永遠に「Scanning...」

- **根拠**: `service-worker.ts:74-79` の `RUN_SCAN` チェーン(`initBlocklist().then(...).then(...).then(sendResponse)`)に `.catch` がない。途中で reject すると `sendResponse` が呼ばれず、`popup.ts:166-172` の `setButtonLoading(false)` が実行されない。`GET_SCAN_RESULT`(71-73行)も同様。
- **なぜ負債か**: ユーザーに見える形でUIが固まる。エラーの行き先がない。
- **影響範囲**: popup / dashboard の Scan Now ボタン。
- **変更リスク**: 低。エラー時に `null` を返して UI 側で復帰させるのは安全側の追加。
- **改善案**: チェーンに `.catch((e) => { console.error(...); sendResponse(null); })` を追加。UI 側はエラー応答時にボタンを復帰させ、空状態メッセージを出す。
- **検証**: 単体または手動 — `runFullScan` を強制 throw させ、popup のボタンが復帰すること。
- **扱い**: **実装可**(Phase 4)。

#### B-2. UI 側が chrome.runtime.lastError を確認しない(E-2 と同根)

- **根拠**: `popup.ts:161-171`、`dashboard.ts:245-250, 281-284` のコールバックは `chrome.runtime.lastError` を見ない(コンソールに "Unchecked runtime.lastError" 警告、応答 undefined を null 扱いで暗黙レンダー)。
- **改善案**: E-2 の promise 化(`await chrome.runtime.sendMessage(...)` + try/catch)で構造的に解消する。
- **扱い**: **実装可**(Phase 2 の sendMessage promise 化に含める)。

#### B-3. blocklist-fetcher の裸 catch がエラーを無言で握りつぶす

- **根拠**: `blocklist-fetcher.ts:29-33` と `46-50` の `catch {}` はログを出さない。A-1 の404が今日まで気づかれなかった直接の原因。
- **改善案**: `catch (e) { console.warn("[ExtScanner] blocklist fetch failed:", e); ... }` のように、フォールバック動作は維持しつつ必ずログする。
- **検証**: fetch を失敗させ、ログが出てキャッシュ/フォールバックが返ること。
- **扱い**: **実装可**(Phase 4)。

#### B-4. リスナーの try/catch が onInstalled にしかない

- **根拠**: `service-worker.ts:16-34`(onInstalled)には try/catch + console.error があるが、onStartup(37-40)、onAlarm(43-51)、management 4リスナー(54-66)には無い。失敗は unhandled rejection として消える。
- **改善案**: 共通の `safeRun(label, fn)` ヘルパーで各ハンドラ本体を包み、エラーを `console.error` する(リスナー登録はトップレベル同期のまま)。
- **検証**: 任意のハンドラで強制 throw し、ラベル付きログが出ること。
- **扱い**: **実装可**(Phase 4)。

#### B-5. chrome.notifications.create が fire-and-forget

- **根拠**: `notifier.ts:32-38, 43-49`。失敗(アイコン不正・通知無効化等)が無言の unhandled rejection になる。
- **改善案**: `await` + try/catch(または `.catch`)でログする。
- **扱い**: **実装可**(Phase 4)。

#### B-6. 通知文言「Click to review」に対応する onClicked リスナーが存在しない

- **根拠**: `notifier.ts:36` のメッセージは「Click to review」と言うが、リポジトリ全体に `chrome.notifications.onClicked` のリスナーが無い(grep 済み)。クリックしても何も起きない。
- **なぜ負債か**: ユーザーへの明示的な約束が実装されていない。
- **変更リスク**: 低だが**挙動の追加**である。
- **改善案**: SW トップレベルに `chrome.notifications.onClicked` リスナーを登録し、dashboard を開いて通知をクリアする。
- **扱い**: **実装可**(Phase 4)— ただしデフォルト承認(Q5)。異論があれば文言の修正(「Click to review」を削る)に切り替える。
- **検証**: 手動 — 通知を発火させてクリック→ dashboard が開くこと。

#### B-7. getElementById の非 null アサーション群 — HTML 乖離で全体クラッシュ

- **根拠**: `popup.ts:5-14`、`dashboard.ts:15-33` の `!` / `as`。id が変わるとスクリプト全体が初期化途中で死ぬ。
- **改善案**: 取得失敗時に要素名入りで throw する `mustGetElement(id)` ヘルパー(挙動は同じだが診断可能に)。優先度は低い。
- **扱い**: **実装可**(Phase 3、低優先)。

### カテゴリC: 重複・規約違反・死コード

#### C-1. dashboard.ts が store.ts を完全に迂回 — キー直書き、DEFAULT_PREFERENCES の3重複、マージ規則の不一致、RMW競合

- **根拠**: `dashboard.ts:204-211, 258-265` はインラインのデフォルト値オブジェクトを2回複製し、`dashboard.ts:204, 223, 258, 268, 272` は `"userPreferences"` を文字列直書きする(CLAUDE.md の規約「`store.ts` ヘルパーと `STORAGE_KEYS` を使う」に違反)。さらに `store.ts:23-26` はスプレッドで部分マージするのに dashboard 側は `?? defaults` で全置換と、**デフォルト適用規則がすでに分岐している**。`store.ts:29-33` の `savePreferences` はどこからも呼ばれていない。handleAction と savePrefs の read-modify-write は並行時に互いの書き込みを失わせ得る。
- **なぜ負債か**: 規約違反+重複+静かな仕様分岐。preference に新フィールドを足すとき3箇所の更新が必要で、漏れると静かに壊れる。
- **影響範囲**: userPreferences の読み書き全般。
- **変更リスク**: 低。`loadPreferences()` / `savePreferences()` 経由に統一するのは挙動同値(部分マージの方が安全側)。
- **改善案**: dashboard の全ストレージアクセスを `store.ts` 経由にし、インラインのデフォルト値を削除。RMW は「load → 変更 → save」を1つのヘルパー(例: `updatePreferences(mutator)`)にまとめる。
- **検証**: 既存の保存済み preferences(部分形含む)が読めること。チェックボックス操作・Dismiss/Allowlist 押下後の storage 内容が修正前と同じ形であること。
- **扱い**: **実装可**(Phase 3)。

#### C-2. escapeHtml の重複+引用符未エスケープ — 悪意ある拡張が自分の行を popup から隠せる

- **根拠**: `popup.ts:131-135` と `dashboard.ts:191-195` に同一実装が重複。この実装(textContent→innerHTML 往復)は `&` `<` `>` をエスケープするが**引用符をエスケープしない**。エスケープ結果は二重引用符のHTML属性(`popup.ts:82, 92-93` の `alt` / `data-extension-id` / `aria-label`)に埋め込まれる。拡張名は**拡張自身が自由に決められる攻撃者制御値**であり、`"` を含む名前で自分の `.threat-item` 要素に任意属性(例: `style="display:none"`)を注入し、**スキャナーの脅威リストから自分を視覚的に消せる**(MV3 CSP によりスクリプト実行は不可。属性注入のみ)。また `dashboard.ts:157, 160, 165` は `ext.id` を**一切エスケープせず**属性に埋め込む(現行Chrome IDは `[a-p]{32}` なので今は悪用不能だが、暗黙の不変条件に依存)。
- **なぜ負債か**: 「XSS対策」を名乗るヘルパーが、使われている文脈(属性値)で機能しない。セキュリティ製品として致命的な自己隠蔽を許す。
- **影響範囲**: popup の脅威リスト(現実的に悪用可能)、dashboard(潜在的)。
- **変更リスク**: 低。`& < > " '` の明示的置換は良性データで表示不変。
- **改善案**: `src/shared/utils.ts` に明示的エンティティ置換の `escapeHtml` を1つ実装して両者から使う。`dashboard.ts` の `ext.id` 埋め込みにも適用。
- **検証**: 単体テスト(`"` `'` を含む入力)。手動 — `Evil" style="display:none` のような名前のunpacked拡張を作りスキャン→popupの行が**表示されたまま**で、DOMに注入属性が無いこと。良性拡張の表示が修正前後でピクセル同一であること。
- **扱い**: **実装可**(Phase 4。セキュリティ修正として優先)。

#### C-3. アイコンURL選択ロジックの重複

- **根拠**: `popup.ts:79-80` と `dashboard.ts:85-86` に同一式(`ext.icons.length > 0 ? ext.icons[ext.icons.length-1]!.url : ""`)。
- **改善案**: `shared/utils.ts` に `largestIconUrl(icons)` を抽出。
- **扱い**: **実装可**(Phase 3)。

#### C-4. BlocklistEntry の型形状をインライン再宣言

- **根拠**: `blocklist-fallback.ts:3-6` が `{ reason: string; source: string }` を再宣言(`blocklist-fetcher.ts:8-11` の `BlocklistEntry` を import していない)。
- **改善案**: 型を `shared/types.ts`(または fetcher)に置き、fallback から import する。循環 import にならない配置にする。
- **扱い**: **実装可**(Phase 3)。

#### C-5. popup.ts の未使用変数 loadingEl

- **根拠**: `popup.ts:10` で取得後、一度も参照されない(grep 済み)。
- **改善案**: 削除。あわせて `noUnusedLocals` の有効化を検討(他に違反が無いことを確認の上)。
- **扱い**: **実装可**(Phase 3)。

#### C-6. POPUP_REDESIGN.md がリポジトリ直下に放置された一回限りの設計メモ

- **根拠**: `POPUP_REDESIGN.md` は過去のUI刷新セッションの成果物で、チェックリストは未完了のまま。現在のドキュメント体系(README / CLAUDE.md)と重複・乖離する。
- **改善案**: `docs/` へ移動(削除はしない。歴史的経緯として価値があるかは人間が判断)。
- **扱い**: **実装可**(Phase 3)。

#### C-7. UserPreferences.scanIntervalMinutes はどこからも読まれない死設定

- **根拠**: `shared/types.ts:44`、`store.ts:5`、`dashboard.ts:206, 260` で定義・複製されるが、アラーム作成(`service-worker.ts:24-29`)は定数 `SCAN_INTERVAL_MINUTES` を使う(grep 済み)。
- **なぜ負債か**: 設定可能に見えて効かないフィールド。保存データの形に関わるため勝手に消せない。
- **扱い**: **質問(Q4)**。デフォルト(回答なし)の場合: フィールドは残し、型定義にコメントで「未実装(予約)」と明記するだけにする。
- **検証**: —

#### C-8. ScoredExtension の書き込み専用フィールド

- **根拠**: `shared/types.ts:11-30` のうち `type` / `description` / `homepageUrl` / `updateUrl` は保存されるが UI から読まれない。`scannedAt` は `ScanResult.scannedAt` と重複。
- **なぜ負債か**: 死データだが、**保存済みデータの形状**であり将来のUI表示用の可能性もある。
- **扱い**: **提案のみ**(Q9。デフォルト: 保持)。削除は読み込み互換に影響しないが、勝手に行わない。

### カテゴリD: 契約・ドキュメント乖離

#### D-1. CLAUDE.md の severity-スコア対応表が全ルールの実装と矛盾

- **根拠**: CLAUDE.md は「critical (50-100), high (20-49), medium (10-19), low (1-9), info (0)」と定めるが、実装は score 25 を critical(`host-permissions.ts:43-44`、`install-type.ts:18-19`)、weight≥15 を critical(`permissions.ts:25`)、score 5 を info(`install-type.ts:37-38`)とするなど全面的に不一致。severity の消費箇所は dashboard の表示バッジのみ(`dashboard.ts:98` + CSS)で、スコア計算には使われない(grep 済み)。
- **なぜ負債か**: 新ルールを書く人がどちらに従えばよいか判断できない。
- **改善案**: デフォルト(Q3): **コードを正としCLAUDE.mdを修正**(severityは「スコアと独立に付与する表示用ラベル」と明記)。挙動変更ゼロ。
- **扱い**: **実装可**(Phase 3、ドキュメント修正として)。score 由来の自動導出に変えたい場合のみ Q3 で確認。

#### D-2. README の記載がコードと乖離

- **根拠**: README.md:104-110(および日本語側 301-307)のスコア表 — `<all_urls>` を20点と記載(実装は25点 `host-permissions.ts:42`)、Install Type 最大20点と記載(実装は sideload 25点)。README.md:91「Quick actions to disable or **remove**」— remove アクションは存在しない(`dashboard.ts` には disable / dismiss / allowlist のみ)。
- **改善案**: README をコードに合わせて修正(コードは変えない)。
- **検証**: 修正後の表と `permission-weights.ts` / 各ルールの数値の突合。
- **扱い**: **実装可**(Phase 3)。

#### D-3. メッセージプロトコルが文字列+as キャストで、共有型もエラー契約もない

- **根拠**: `service-worker.ts:69-87` は `message.type` を裸の文字列比較、`popup.ts:161-171` / `dashboard.ts:245-250, 281-284` は応答を `as ScanResult | null` でキャスト。エラー応答の形が未定義(B-1 と同根)。
- **改善案**: `shared/messages.ts` に要求・応答のユニオン型(`{ type: "GET_SCAN_RESULT" } | ...` と応答型)を定義し、両側で使う。**文字列値は変えない**。
- **検証**: tsc green。手動でメッセージ往復の動作確認。
- **扱い**: **実装可**(Phase 5)。

#### D-4. 保存データにスキーマバージョンも読込時の形状検証もない

- **根拠**: `store.ts:16-19` は `as ScanResult` で無検証キャスト。`popup.ts:80` 等は配列存在を信じて添字アクセス。将来 ScanResult の形を変えると旧データ読込で実行時エラーになり得る。
- **改善案**: ①`schemaVersion` フィールドを**新規追加**(既存キーの形は変えない)。②読込時に最低限の形状チェック(extensions が配列か等)をして不一致なら null 扱い。今後の形状変更はバージョンで分岐。
- **変更リスク**: 低(追加のみ)。ただし「不一致なら null」は旧データを「スキャン無し」扱いにするため、現行形は必ず valid と判定されるようにテストで保証する。
- **扱い**: **実装可**(Phase 5)。
- **検証**: 現行形の保存データがそのまま読めること(フィクスチャテスト)。

#### D-5. ScoringRule が chrome.management.ExtensionInfo に直結

- **根拠**: `scoring/types.ts:6`。ルール層が Chrome API 型に依存し、テストでは ExtensionInfo 全体のフィクスチャが必要。
- **なぜ負債か**: 中程度。ただし現状でも ExtensionInfo はただのデータオブジェクトでありテストは可能。抽象を挟む利得は今は薄い。
- **扱い**: **提案のみ**(過剰抽象化のリスクの方が高い。テストで困った時に再検討)。

### カテゴリE: ビルド・CI・環境

#### E-1. 品質ゲートが存在しない — main は現在型エラーを含む

- **根拠**: `package.json:6-9` に typecheck/lint/test なし。`.github/workflows/release.yml:3-12` は `v*` タグでのみ起動。型壊れコミットが無言で main に積める(現に積まれている)。
- **改善案**: ①`"typecheck": "tsc --noEmit"`、`"test": "vitest run"` スクリプト追加。②push/PR で `npm ci && npm run typecheck && npm test && npm run build` を回す CI ワークフロー(`.github/workflows/ci.yml`)新設。
- **扱い**: **実装可**(スクリプトは Phase 1、CI は Phase 2 で tsc green 後に)。

#### E-2. sendMessage コールバック形式による型エラー8件(現状の tsc 失敗の全原因)

- **根拠**: `popup.ts:161-163, 168-171`、`dashboard.ts:245-250, 281-284`。インストール済み `chrome-types` の `runtime.sendMessage` は **Promise 形式のみ**を提供(コールバックオーバーロードなし。`node_modules/chrome-types/index.d.ts` 確認済み)。Chrome 99+ で promise 対応済みであり、対象は Chrome 88+ だが MV3 拡張の実質要件として問題ない。
- **改善案**: 4箇所を `const result = await chrome.runtime.sendMessage({...})` + try/catch に書き換え(B-2 の lastError 問題も同時解消)。UI の更新順序(ボタン無効化→送信→描画→復帰)は維持。
- **検証**: tsc green。手動で popup / dashboard の Scan Now、初期表示、設定保存が動くこと。
- **扱い**: **実装可**(Phase 2)。

#### E-3. flattenHtmlPlugin がページ一覧を直書き — ページ追加時に無言でdistから消える

- **根拠**: `vite.config.ts:13-16` の `htmlMoves` と `49-53` の rollup `input` が二重管理。新ページを input に足して htmlMoves を忘れると、ビルド成功後に 34-37行の `rmSync` で**HTMLごと削除**される。
- **改善案**: htmlMoves を rollup input から導出する、または closeBundle 時に `dist/src/` 配下に残った `.html` を検出して**ビルドを失敗させる**。出力が現状と byte 同一であることを確認。
- **検証**: `npm run build` 後の dist ファイル一覧と popup.html / dashboard.html の内容 diff が修正前後で同一。
- **扱い**: **実装可**(Phase 3)。

#### E-4. バージョンが3箇所(package.json / manifest.json / gitタグ)で連携なし

- **根拠**: `package.json:3` と `public/manifest.json:4` がともに 0.1.0。`release.yml:37-41` はタグで起動するのに dist/manifest.json からバージョンを読むため、タグと manifest がズレてもそのままリリースされる。
- **改善案**: release.yml にタグ(`v` 除去後)と manifest.version の一致チェックを追加し、不一致なら fail。
- **扱い**: **実装可**(Phase 3)。

#### E-5. release.yml の workflow_dispatch 経路が死んでいる

- **根拠**: `release.yml:7-12` の `version` 入力はどのステップからも参照されない。ブランチから dispatch しても release 作成は失敗する。
- **扱い**: **提案のみ**(dispatch でのリリースを許すかはリリースプロセスの判断。最小修正案: 未使用 input の削除)。

#### E-6. tsconfig の死設定と vite.config.ts の型チェック漏れ

- **根拠**: `tsconfig.json:11-12` の outDir/rootDir は tsc がビルドに使われないため死設定。`include` は `src/**/*.ts` のみで `vite.config.ts` が型チェック対象外。
- **改善案**: outDir/rootDir を削除し、`noEmit: true` を明示。vite.config.ts は別 tsconfig(`tsconfig.node.json`)で対象化するか、現状維持を明記。
- **扱い**: **実装可**(Phase 3、低優先)。

#### E-7. Node バージョンの宣言が CI 内にしかない

- **根拠**: `release.yml:27-29` の Node 22 指定のみ。`package.json` に engines なし、`.nvmrc` なし。
- **改善案**: `"engines": { "node": ">=22" }` と `.nvmrc`(22)を追加。
- **扱い**: **実装可**(Phase 3)。

### カテゴリF: スコアリングポリシー(プロダクト判断 — 全件、承認なしの実装禁止)

#### F-1. 未知パーミッションへの一律 +5 — 良性の最新権限を黄色化し、危険な未収載権限を過小評価

- **根拠**: `permissions.ts:28-36`(未知は +5 medium)。`permission-weights.ts` は29項目のみで、`sidePanel` / `offscreen` / `tabGroups` 等の良性権限も、`tabCapture` / `audioCapture` / `userScripts` 等の危険権限も未収載=+5。さらに `permissions.ts:53-55` の `?? 5` により未知6個で「excessive scope +10」が発火し、**良性権限だけで yellow(≥30)に到達する**。
- **改善案(承認後)**: 権限カタログの完備、未知は 0点+info、`?? 5` の廃止。
- **扱い**: **提案のみ(Q6)**。データ表の変更はスコア=製品の主出力を変えるため。

#### F-2. sensitive-domain 判定が非アンカーの部分文字列 — `netflix.com` が `/x\.com/` に一致、加点無上限で最小権限が逆転

- **根拠**: `host-permissions.ts:6-24, 76-89`。`box.com` / `wix.com` / `netflix.com` →「x.com」一致、`burbankca.gov` →「bank」一致(実際にregexで確認済み)。ホストごと+8で上限なし → 9ホストで red(72)。一方 `<all_urls>` は25点で、**全サイトアクセスの方が低スコア**になる。
- **改善案(承認後)**: match pattern をホスト名にパースし、登録可能ドメイン境界でアンカーした照合+合計を `<all_urls>` の25点以下にキャップ。
- **扱い**: **提案のみ(Q6)**。

#### F-3. 偽装検知パターンが正規の Google 拡張を誤検知

- **根拠**: `suspicious-patterns.ts:12-25` の `/^google\s/i` `/^chrome\s/i` が「Google Docs Offline」等のプリインストール拡張に +10 high「possible impersonation」を付ける。除外シグナル(`updateUrl` が `clients2.google.com` かつ installType normal)は `metadata.ts:24-28` で既に計算しているのに使っていない。
- **扱い**: **質問(Q7)**。除外を入れるとストア配布の偽装マルウェアも除外されるトレードオフがあるため。

#### F-4. ブロックリストの信頼モデル — 単一の非認証ソースが「Known malicious」判定を完全制御

- **根拠**: `constants.ts:16-17` + `blocklist-fetcher.ts:56`。整合性検証・provenance なし。
- **扱い**: **提案のみ**(Q1 の取得先決定とセットで設計判断)。

#### F-5. popup が Google Fonts を外部読み込み — セキュリティ製品が開くたびに第三者へ通信

- **根拠**: `popup.html:6-11`(preconnect 2件+stylesheet)。dashboard はシステムフォントスタック(`dashboard.css:8`)で外部依存なし、と不統一。オフライン時はフォールバックフォントで表示は崩れない(`popup.css:24`)。POPUP_REDESIGN.md はこのフォントを意図的な設計として記録している。
- **扱い**: **質問(Q8)**。デフォルト: WOFF2 をリポジトリに同梱しローカル `@font-face` 化(見た目不変)。ネットワーク取得が実装環境でできない場合は質問に戻す。

---

## Implementation Phases

フェーズは順番に実施する。**各フェーズ完了時に Verification Requirements の該当項目を実行し、結果を記録してから次へ進む。**

### Phase 0: 現状確認(変更なし)

1. `git status` を確認。クリーンでなければ報告して停止。
2. Baseline Commands をすべて実行し、結果を記録。
3. このドキュメントの Debt Map と実コードの食い違いがないかサンプル確認(A-1 のURL、E-2 のエラー箇所など)。食い違いがあれば報告して停止(Stop And Ask 条件8)。

**成果物**: ベースライン記録。コミットなし。

### Phase 1: 安全網の構築(挙動変更ゼロ)

1. devDependency に `vitest` を追加(これは事前承認済みの唯一の依存追加)。
2. `package.json` に `"typecheck": "tsc --noEmit"`、`"test": "vitest run"` を追加。
3. **特性テスト(characterization tests)**を書く。現挙動を「正」として固定する。仕様への期待ではなく**実際の出力**をアサートする:
   - 各ルール(`blocklist` / `permissions` / `host-permissions` / `install-type` / `metadata`)単体: 代表的な ExtensionInfo フィクスチャ(最小権限 / `<all_urls>` / 危険コンボ / sideload / 偽装名 / blocklist一致)に対する `RuleResult[]` 全体。
   - `scoreExtension()` / リスク分類: 合計値と riskLevel(境界値 29/30/69/70 を含む)。
   - blocklist 未初期化時に blocklist ルールが `[]` を返すこと(A-2 の現挙動固定)。
   - `notifyNewThreats` の判定ロジック(chrome API は最小モック): 新規IDのみ対象であること、dismissed/allowlist が既存IDに効かないこと(A-7 の現挙動固定)。
   - F-2 の誤検知(`https://netflix.com/*` が sensitive 判定される)も**現挙動として**テストに固定し、`// 既知の誤検知: F-2 参照` とコメントする。
4. テストから `chrome.*` を触る必要が出たら、グローバルへの最小スタブで対応。プロダクションコードの変更はこのフェーズでは**禁止**(テスト可能にするための export 追加が必要なら報告)。

**成果物**: `npm test` green。コミット例: `test: add characterization tests for scoring engine and rules`

### Phase 2: 型エラー解消と CI ゲート

1. E-2: `popup.ts` / `dashboard.ts` の4箇所を promise 形式(`await chrome.runtime.sendMessage`)+ try/catch に書き換える(B-2 を同時解消)。UI の状態遷移(ボタン無効化→復帰)は現状維持。
2. `npx tsc --noEmit` が 0 エラーになることを確認。
3. E-1: `.github/workflows/ci.yml` を新設(push / pull_request で `npm ci` → typecheck → test → build)。
4. 手動検証: ビルドした拡張を読み込み、popup 初期表示・Scan Now・Full Report・dashboard の Scan Now・設定チェックボックスが動くこと。

**成果物**: tsc green、CI green。コミットは「sendMessage promise化」「CI追加」で分割。

### Phase 3: 挙動を変えない整理

順不同で1項目=1コミット。各コミット後に `npm run typecheck && npm test && npm run build`。

- C-1: dashboard のストレージアクセスを `store.ts` 経由に統一、インラインデフォルト削除、`updatePreferences(mutator)` ヘルパー導入。
- C-3: `largestIconUrl()` を `shared/utils.ts` に抽出。
- C-4: `BlocklistEntry` 型の一元化。
- C-5: 未使用 `loadingEl` 削除。
- C-6: `POPUP_REDESIGN.md` → `docs/POPUP_REDESIGN.md` に移動(中身は変更しない)。
- D-1: CLAUDE.md の severity 記述を実装に合わせて修正(「表示用ラベルでありスコアとは独立」と明記)。
- D-2: README のスコア表と "remove" 記述を実コードに合わせて修正。
- E-3: flattenHtmlPlugin の二重管理解消(input から導出 or 残存HTML検出で fail)。**修正前後で dist の全ファイル diff が同一であることを確認。**
- E-4: release.yml にタグ⇔manifest バージョン一致チェック追加。
- E-6: tsconfig の死設定除去(`noEmit: true` 明示)。
- E-7: engines フィールドと `.nvmrc` 追加。
- B-7(任意・低優先): `mustGetElement()` ヘルパー。

**成果物**: 全テスト green のまま。dist 出力同一。

### Phase 4: 検出パイプラインの信頼性修正(承認済みの挙動修正)

ここからは**意図的な挙動変更**を含む。1項目=1コミットとし、コミットメッセージに「何の挙動がどう変わるか」を明記する。対応する特性テストの更新は、変更点だけを最小限に行い、変更理由をテストコメントに書く。

1. C-2: `escapeHtml` を共有化し `& < > " '` を明示的に置換。dashboard の `ext.id` にも適用。(セキュリティ修正のため先頭)
2. A-2: `performScan()` 冒頭に `await initBlocklist()`。
3. A-3: blocklist-update アラームで `setBlocklistData(fresh)` + `await performScan()`。
4. A-4: `parseBlocklist()` 純関数抽出+空/形状不正を throw +サイズ上限。既存キャッシュ温存の確認テスト。
5. B-3: blocklist-fetcher の catch にログ追加。
6. A-5: ルール単位の try/catch(失敗時 `console.error` 必須)。
7. B-1: onMessage チェーンに `.catch`(エラー時 `sendResponse(null)`)+ UI 側の復帰処理。
8. B-4: `safeRun()` ヘルパーで全リスナー本体を包む。
9. B-5: notifications.create のエラーハンドリング。
10. A-6: スキャンの in-flight ガード+dashboard の二重スキャン解消。
11. A-8: onStartup でのアラームべき等再作成。
12. B-6(Q5 デフォルト承認の場合): `chrome.notifications.onClicked` で dashboard を開く。

**成果物**: 各修正に対応するテスト。手動検証(Verification Requirements 参照)。

### Phase 5: 境界とインターフェースの明確化

- D-3: `shared/messages.ts` のメッセージ型定義と両側での利用(文字列値は不変)。
- D-4: ScanResult 保存への `schemaVersion` **追加**と読込時の形状チェック(現行データが valid と判定されるフィクスチャテスト必須)。

### Phase 6: 承認待ち項目(質問の回答が出るまで実装禁止)

- Q1 回答後: ブロックリスト新ソースの実装、フォールバックリストの実データ化(A-1 / F-4)。
- Q2 回答後: Allowlist / Dismiss / 昇格通知のセマンティクス実装(A-7)。
- Q6 承認後: F-1 / F-2 のスコアリング修正(承認された場合、Phase 1 で固定した該当特性テストを新仕様に書き換える)。
- Q7 / Q8 / Q9 の回答に応じて F-3 / F-5 / C-8。
- 回答が無い項目は、**修正案の設計メモを書いて終了**とする(コード変更なし)。

---

## Verification Requirements

### 全フェーズ共通

各フェーズの最後に必ず:

```bash
npm run typecheck   # Phase 2 以降: 0 エラー
npm test            # Phase 1 以降: 全件 pass
npm run build       # 常に成功。dist/ 直下構造が Behaviors To Preserve #10 と一致
```

### dist 同一性チェック(Phase 3 の E-3 と、ビルド設定に触れる全変更)

変更前後で `npm run build` を実行し、`dist/` の全ファイルについて一覧と内容の diff を取り、差分ゼロ(またはタイムスタンプ等の説明可能な差分のみ)であることを記録する。

### 手動検証(Phase 2 / 4 の完了時に必須)

Chrome(Developer Mode)で `dist/` を読み込み:

1. インストール直後に初期スキャンが走り、バッジが付く。
2. popup: 件数表示・脅威リスト・Scan Now(ボタンが復帰する)・Full Report。
3. dashboard: 一覧・フィルタ・検索・カード展開・設定チェックボックスの保存。
4. SW のコンソール(chrome://extensions → service worker)にエラーがないこと。fetch 404 のログが**出ること**(B-3 修正後。これは正常: 上流が404のため)。
5. Phase 4 後の追加確認:
   - SW を停止→他拡張の有効/無効切替→ `chrome.storage.local` の `lastScanResult` を確認(A-2)。
   - `Evil" style="display:none` のような名前の unpacked 拡張でスキャン→popup の行が表示されたまま(C-2)。
   - `runFullScan` を一時的に throw させ、popup ボタンが復帰しエラーログが出る(B-1)— 確認後は必ず元に戻す。

### テストの規律

- Phase 1 の特性テストは Phase 3〜5 を通じて**無変更で green** を維持する。
- Phase 4 で挙動を意図的に変える場合のみ、該当テストを最小限更新し、コミットメッセージとテストコメントに理由を書く。
- テストが「仕様としておかしい挙動」を固定している場合(例: F-2 の誤検知)は、コメントで Debt Map の ID を参照する。勝手に「正しい仕様」へ直さない。

---

## Reporting Format

各フェーズ完了時に、次の形式で報告する。

```markdown
## Phase N 報告

### 変更内容
- [コミットハッシュ] 一行説明(変えた挙動があれば「挙動変更: ...」と明記)

### 実行した検証コマンドと結果
- `npm run typecheck` → 0 errors
- `npm test` → X passed
- `npm run build` → success(dist 構造確認済み)
- 手動検証: 実施項目と結果

### 発見事項・逸脱
- ドキュメントとコードの食い違い、想定外の挙動、スキップした項目とその理由

### 未解決の質問(あれば)
```

最終報告には、**最後に実行した全コマンドとその結果**、未実施項目の一覧、Phase 6 で書いた提案メモの場所を含める。

---

## Out-of-scope Items

以下はこのリファクタリングでは**行わない**。

1. UIデザインの変更(レイアウト・配色・アニメーション)。
2. 新機能の追加(B-6 の通知クリックと Q 回答済み項目を除く)。
3. スコアリングの重み・閾値・ルールロジックの変更(Q6/Q7 で承認された場合の Phase 6 を除く)。
4. 依存パッケージのメジャーアップグレード(vite 5→6 等)、フレームワーク導入、ビルドツール置き換え。
5. `public/manifest.json` の変更(permissions・CSP・バージョン)。
6. Chrome Web Store 公開準備・ストア対応。
7. パフォーマンス最適化(現状、対象データは高々数十拡張であり最適化の根拠がない)。
8. i18n / 多言語化。
9. lint(ESLint / Prettier)の導入 — 望ましいが今回のスコープ外。提案として残すのは可。
10. `dist/` や `node_modules/` 内のファイルの直接編集。

---

## 付録: 未解決の質問(人間の回答待ち)

> 実装担当への指示: **Q1・Q2 はブロッカー**(該当する Phase 6 項目を実装してはならない)。Q3〜Q9 は「デフォルト」記載の方針で進めてよいが、回答があればそれに従う。

- **Q1(ブロッカー)**: ブロックリスト取得先 `nicoleahmed/chrome-mal-ids` は404(2026-06-13確認)。後継 `The-Privacy-Commons-Institute/chrome-mal-ids` はSTIX/MISP形式。どのソース・形式に移行するか?空のフォールバックリストに実データのスナップショットを同梱するか?
- **Q2(ブロッカー)**: 「Add to Allowlist」「Dismiss」の正しいセマンティクスは?(通知抑制のみ / バッジ・一覧からも除外 / スコア緑化)。また、既存拡張のリスク昇格(green→red)時に通知すべきか?(現状は新規IDのみ通知)
- **Q3**: severity の正は?デフォルト: コードを正とし CLAUDE.md の対応表を修正(表示専用ラベルと明記)。
- **Q4**: `UserPreferences.scanIntervalMinutes`(死設定)はユーザー設定化するか削除するか?デフォルト: 保持し「未実装(予約)」とコメント。
- **Q5**: 通知クリックで dashboard を開く `onClicked` リスナーを追加してよいか?(通知文言が既に「Click to review」と約束している)デフォルト: 追加する。
- **Q6**: スコアリング修正の承認 — F-1(未知権限+5の廃止と権限カタログ完備)/ F-2(sensitive-domain のアンカー照合+キャップ)。承認なしでは実装しない。
- **Q7**: `/^google\s/` 等の偽装パターンが正規 Google 拡張を誤検知する件 — store 由来(updateUrl=clients2.google.com かつ installType=normal)を除外してよいか?デフォルト: 現状維持(提案メモのみ)。
- **Q8**: popup の Google Fonts — ローカル同梱(見た目不変・推奨)/ システムフォント化 / 現状維持?デフォルト: ローカル同梱(フォント取得不能なら現状維持で報告)。
- **Q9**: `ScoredExtension` の未使用フィールド(type/description/homepageUrl/updateUrl、重複 scannedAt)を削除するか?デフォルト: 保持。
