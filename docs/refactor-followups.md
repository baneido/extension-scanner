# Refactor Follow-ups (design memos for deferred items)

- 作成日: 2026-06-14
- 文脈: `refactor-instructions.md` の Phase 6。コードからは正解を確定できない、またはプロダクト判断・人間の承認が必要なため、**実装せず設計メモのみ**を残す項目。
- 各項目は Debt Map の ID を引き継ぐ。実装する場合は、まず該当する Phase 1 特性テストの更新方針を決めてから着手すること。

---

## ブロッカー(回答が出るまで実装禁止)

### Q1 / A-1 / F-4: ブロックリスト取得先が404、信頼モデルも要設計

- **現状**: `src/shared/constants.ts` の `BLOCKLIST_SOURCE_URL`(`nicoleahmed/chrome-mal-ids`)は 2026-06-14 時点で **HTTP 404**。後継 `The-Privacy-Commons-Institute/chrome-mal-ids` は STIX/MISP 形式で、現在のパーサ(JSON 文字列配列)とは非互換。フォールバック(`blocklist-fallback.ts`)は空。
- **本リファクタで実施済みの緩和**: 失敗のログ化(B-3)、空・不正応答を成功扱いしない(A-4)、`parseBlocklist()` の単体テスト化。これにより「404 が無言で 100点ルールを無効化する」状態は**可視化**された(SW コンソールに警告が出る)が、**ブロックリスト自体は依然として空**。
- **要判断**:
  1. 採用する取得先と形式(後継リポジトリの STIX/MISP を変換するアダプタを書くか、別ソースか、CI でビルド時にスナップショットを同梱するか)。
  2. 信頼モデル: 単一の非認証 raw GitHub URL に「Known malicious(100点)」判定を全面依存してよいか。整合性チェック(ハッシュ/署名)や複数ソース照合の要否。
  3. `FALLBACK_MALICIOUS_IDS` に実データのスナップショットを入れるか、誰が更新するか。
- **実装時の注意**: 形式が変わる場合は `parseBlocklist()` を差し替え、対応する `test/blocklist.test.ts` を新形式に更新する。取得先 URL の変更は `Non-Negotiables`(新ネットワーク接続先の追加)に該当するため、変更そのものに承認が要る。

### Q2 / A-7: Allowlist / Dismiss のセマンティクス未定義、昇格通知なし

- **現状**: `dashboard.ts` の「Add to Allowlist」「Dismiss」は `userPreferences` に ID を書くだけ。唯一の読み手 `notifier.ts` は `previousIds.has(id)` を先に判定するため、**既存拡張には設定が一切効かない**(再インストール時のみ有効)。スコア・バッジ・一覧はこれらを無視。既存拡張が green→red に昇格しても通知されない。
- **要判断**:
  1. allowlist の意味: 脅威カウント/バッジ/popup一覧から除外? スコアを green に固定? 通知抑制のみ? ダッシュボードには「allowlisted」表示で残す?
  2. dismiss の意味: 通知抑制のみ? popup一覧からも除外?
  3. リスク昇格時(例: ブロックリスト更新で green→red)に通知すべきか。
  4. これらの一覧を閲覧・取り消す UI を出すか。
- **設計案(一案)**: スキャン後段に「抑制フィルタ」を1箇所設ける。`allowlist` は脅威カウント・バッジ・popup一覧から除外しつつ dashboard には「許可済み」タグ+取り消しボタンで残す。`dismiss` は通知と popup 列挙のみ抑制しスコアは保持。通知判定は「ID が新規」ではなく「(ID, riskLevel) の組が前回より悪化」に変更すると昇格通知が実現する。
- **重大な注意**: allowlist をスコア/バッジに反映する設計は「誤って許可した悪意ある拡張を隠す」セキュリティトレードオフを伴う。必ずプロダクトオーナーの承認を得ること。実装時は `test/notifier.test.ts` の「ID-only 現挙動を固定したテスト(A-7注記つき)」を新仕様へ書き換える。

---

## スコアリングポリシー(承認なしの実装禁止)

スコアの重み・閾値・分類は製品の主出力。変更は保存される `ScanResult`・バッジ・通知に波及するため、いずれも**承認後**に着手し、Phase 1 で固定した該当特性テストを新仕様へ更新する。

### Q6 / F-1: 未知パーミッションへの一律 +5

- **問題**: `permissions.ts` は `PERMISSION_WEIGHTS`(29項目)に無い権限を一律 +5/medium とし、`?? 5` により未知6個で「excessive scope +10」が発火、良性の最新権限(`sidePanel`/`offscreen`/`tabGroups` 等)だけで yellow(≥30)に到達する。逆に危険な未収載権限(`tabCapture`/`audioCapture`/`userScripts`)も +5 で過小評価。
- **設計案**: 現行 Chrome の全権限にカタログを拡充(良性は0、capture/userScripts 系は高め)。真に未知の権限は score 0 + info(「未認識の権限」)に降格。`riskyPermCount` の `?? 5` を廃止し未知を除外。必要なら権限カテゴリ小計にキャップ。
- **検証**: `permissionsRule`/`scoreExtension` のフィクスチャテストで「良性権限セットは green を維持」「`tabCapture` は `desktopCapture` 級」「未知は riskyPermCount に数えない」を固定。代表的な人気拡張のリスク分類を変更前後で目視比較。

### Q6 / F-2: sensitive-domain が非アンカーの部分文字列照合、加点無上限

- **問題**: `host-permissions.ts` の `SENSITIVE_DOMAIN_PATTERNS` は非アンカー正規表現を**生のmatch pattern文字列**に対して test するため、`netflix.com`→`/x\.com/`、`box.com`/`wix.com`→`/x\.com/`、`burbankca.gov`→`/bank/` が誤一致。ホストごと +8 で上限がなく、9ホストで red(72)。一方 `<all_urls>` は25点で、**全サイトアクセスの方が低スコア**になる逆転がある(`test/rules.test.ts` に F-2 の現挙動を固定済み)。
- **設計案**: 各 match pattern をホスト名へパースし、登録可能ドメイン境界でアンカー照合(例 `/(^|\.)x\.com$/`)。sensitive 合計を `<all_urls>` の25点以下にキャップし、限定アクセスが全アクセスを上回らないようにする。
- **検証**: `hostPermissionsRule` のテーブル駆動テストで `netflix.com`/`box.com`/`burbankca.gov` は無検出、`www.bankofamerica.com`/`x.com` は検出、10ホストでも合計 ≤ キャップ、`<all_urls>` は25点を維持。実装時に `test/rules.test.ts` の F-2 注記テストを修正後挙動へ更新。

### Q7 / F-3: 偽装検知が正規 Google/Chrome 拡張を誤検知

- **問題**: `suspicious-patterns.ts` の `/^google\s/i`・`/^chrome\s/i` が「Google Docs Offline」等のプリインストール拡張に +10「possible impersonation」を付ける。除外シグナル(`updateUrl` に `clients2.google.com` かつ `installType` が `normal`)は `metadata.ts` で既に計算済みだが未使用。
- **要判断**: store 由来の正規拡張を除外すると、ストア配布の偽装マルウェアも除外されるトレードオフがある。除外を入れるか、現状維持(誤検知許容)か。
- **デフォルト(回答なし)**: 現状維持。
- **設計案(除外する場合)**: `updateUrl` が `clients2.google.com` を含み、かつ `installType === "normal"` のときのみ ^google/^chrome パターンを info/0 に降格。`metadataRule` のテストで「store由来は無検出/非store・sideload は +10維持」を固定。

### Q8 / F-5: popup が Google Fonts を外部読み込み(プライバシー)

- **問題**: `popup.html` が `fonts.googleapis.com`/`fonts.gstatic.com` に preconnect + stylesheet リンク。セキュリティ製品が popup を開くたび第三者へ通信する。dashboard はシステムフォントスタックで外部依存なし、と不統一。オフライン時はフォールバックフォントで表示は崩れない。`docs/POPUP_REDESIGN.md` はこのフォントを意図的設計として記録。
- **本リファクタで未実施の理由**: ローカル同梱は WOFF2 のフェッチ・サブセット化・`@font-face` 追加・preload削除を伴い、視覚的同一性の確認にブラウザ実機が必要。サンドボックスでは検証不能のため、半端な変更を避け設計メモに留めた(指示書 Q8 の「フォント取得不能なら現状維持で報告」に準拠)。
- **デフォルト方針(推奨)**: Fira Sans / Fira Code の必要ウェイトの WOFF2 を `public/` 配下に同梱し、`popup.css` にローカル `@font-face` を定義、`popup.html` の3つのリモート `<link>`(preconnect×2 + stylesheet)を削除。あわせて `docs/POPUP_REDESIGN.md` のフォント記述を更新。
- **検証**: 再ビルドして拡張を読み込み、DevTools Network で popup を開いたとき拡張オリジン外への通信が(blocklist fetch 以外)ゼロであること。ネットワーク無効でフォント表示(または意図したフォールバック)を確認。
- **代替案**: dashboard と同じシステムフォントスタックに統一(同梱不要だが見た目が変わる)。

---

## 構造的負債(提案のみ)

### C-8 / Q9: ScoredExtension の書き込み専用フィールド

- `src/shared/types.ts` の `ScoredExtension` のうち `type` / `description` / `homepageUrl` / `updateUrl` は保存されるが UI から読まれない。`scannedAt` は `ScanResult.scannedAt` と重複。
- **デフォルト**: 保持(将来のUI表示用の可能性、保存データ形状への影響回避)。削除する場合も読み込み互換は壊れないが、`Stop And Ask` 条件(保存データ形状)に触れるため承認を得る。

### D-5: ScoringRule が chrome.management.ExtensionInfo に直結

- `scoring/types.ts` の `evaluate(ext: chrome.management.ExtensionInfo)` がルール層を Chrome API 型に結合。
- **判断**: 現状でも ExtensionInfo はデータオブジェクトでありテスト可能(本リファクタで実証済み)。抽象を挟む利得は薄く、過剰抽象化のリスクの方が高い。**当面は現状維持**。ルール層を他データ源にも使う必要が出た時に、必要なフィールドだけの内部型へマッピングする層を再検討する。

### E-5: release.yml の workflow_dispatch 経路が不完全

- `release.yml` の `workflow_dispatch.inputs.version` はどのステップからも参照されず、ブランチからの dispatch では release 作成が成立しない。
- **判断**: dispatch でのリリースを正式サポートするか(タグ作成まで自動化する等)はリリースプロセスの設計判断。最小修正は未使用 input の削除。**提案のみ**。

### B-7: getElementById の非nullアサーション

- `popup.ts` / `dashboard.ts` の `getElementById(...)!`。HTML の id が変わると初期化途中で全体が落ちる。
- **本リファクタで見送った理由**: 任意・低優先。共有 `mustGetElement()` を入れると2ファイルの全取得箇所に波及し、DOM 依存を共有ユーティリティに持ち込む設計判断が要る。診断性の改善に留まり挙動は変えないため、優先度を下げて見送り。
- **実装する場合**: UI 専用の小ヘルパー(例 `src/shared/dom.ts`)に `mustGetElement(id)` を置き、取得失敗時に id 入りで throw。挙動は同じ(従来も `!` で null 前提)だが診断メッセージが明確になる。
