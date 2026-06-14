# Refactor Follow-ups — Security Decision Record

- 作成日: 2026-06-14
- 文脈: `refactor-instructions.md` の Phase 6 で「設計メモのみ」とした残課題について、**セキュリティエンジニア目線で方針を決定**したもの。各決定は独立した敵対的レビュー(バイパス・誤った安心感・過剰実装・検証不能性の観点)を通過済み(全件 endorse)。
- ステータス凡例: ✅ 実装済み / 📝 方針決定・コードは現状維持(documented policy) / ⏸ 計画済み・未実装。
- 各項目は Debt Map / Q 番号を引き継ぐ。

---

## 検出精度(スコアリング)

### F-2: sensitive-domain 照合 — ✅ 実装済み
- **決定**: 修正する。非アンカー部分文字列照合(`netflix.com`→`/x\.com/`、`burbankca.gov`→`/bank/` の誤検知、かつ加点無上限で最小権限が `<all_urls>` を逆転)はセキュリティツールの信頼を損なう実バグ。
- **実装**: match pattern をホスト名にパースし、登録ドメイン境界で照合(完全一致 or サブドメイン)。`bank`/`crypto` はラベル先頭一致(`bankofamerica` は採用、`burbankca` は不採用)。per-host findings を単一 finding に集約し、合計を **24(<`<all_urls>` の 25)にキャップ**して最小権限の逆転を解消。`host-permissions.ts`、テーブル駆動テスト追加。

### F-1: 未知パーミッション +5 — ✅ 実装済み
- **決定**: 修正する。良性の最新権限(`sidePanel`/`offscreen`/…)を黄色化し、危険な未収載権限(`tabCapture`/`userScripts`/…)を過小評価していた。
- **実装**: `PERMISSION_WEIGHTS` に現行 Chrome 権限を約40追加(capture/inject系は high/critical、UI系は 0-2)。真に未知の権限は **+3/low**(従来 +5/medium)に降格し可視性は維持。`riskyPermCount` の述語を `(weight ?? 0) >= 7` に変更し、未知が「過剰スコープ +10」を自動発火しないようにした。severity ラダーに low 帯(weight 1-4)を追加。

### F-3: 偽装検知の誤検知 — ✅ 実装済み
- **決定**: 修正する。ただし**ストア由来を素朴に除外しない**。検証で判明した通り、Chrome Web Store の全拡張は `clients2.google.com` を update URL に持つため、「update URL = clients2.google.com」では「本物の Google 製」を証明できず、ストア掲載の偽装マルウェアにバイパスを与えてしまう。
- **実装**: `/^google\s/`・`/^chrome\s/` 偽装パターンを **`installType` が `normal`/`admin`(ストア/管理者由来)では抑制**し、`sideload`/`development`(オフストア=偽装の実ベクトル)でのみ +10 を付与。`installType` は Chrome が証明する provenance チャネルであり、不明値は非ストア扱い(fail-safe)。ストア掲載偽装はブロックリストで担保。`suspicious-patterns.ts`/`metadata.ts`、テスト更新。

### F-4: ブロックリストの信頼モデル — 一部 ✅ / 一部 📝
取得先の権威性は Q1 で解決済み。残る信頼モデルは3つに分けて判断した。
1. **完全性検証(MD5/チェックサム): 📝 採用しない。** 公開チェックサム `current-list-meta-chksum.txt` は **CSV の MD5 であって消費する `current-list.json` のものではなく**、しかも同一オリジン由来。同一オリジンのハッシュは転送破損しか検出できず、上流侵害(本来の脅威)は検出できない。転送は既に TLS で保護され、破損は `parseBlocklist`(A-4)が拒否する。MD5 を足すと「暗号学的に検証済み」という**誤った安心感**を与える純負債。上流が `current-list.json` の SHA-256 を out-of-band で公開したら再検討。
2. **多重ソース照合 / 単一ソースの重み低減: 📝 採用しない。** 既知悪性 ID(100点)の重みを下げる/ゲートするのはマルウェアスキャナにとって**偽陰性**(危険な方向)を生む。第二の権威的・CORS 対応 Chrome IOC フィードが現れたら、フラグを**ゲートせず信頼度を上げる**方向でのみ照合を検討。
3. **防御の多層化(フォールバック実データ化 + 鮮度の可視化): ✅ 実装済み。** 最も価値が高い(前ソースが無言で死んだ失敗モードの再発防止)。
   - **(3a) フォールバックのスナップショット化**: 決定案の「ビルド時 fetch」は**修正**し、**ハーメティックビルド**を優先。`npm run update-blocklist`(`scripts/update-blocklist-snapshot.mjs`)が権威ソースを取得・検証し `src/data/blocklist-snapshot.generated.ts`(3000 ID)を生成。`FALLBACK_MALICIOUS_IDS` がこれを読み非空化。0件なら書き込み拒否。週次の `update-blocklist.yml` ワークフローが PR を開いて更新(直接 main へは入れずレビュー経由)。本番ビルドはコミット済みファイルを読むだけ=ネットワーク非依存。
   - **(3b) 鮮度・可用性の可視化**: 取得成否・件数・最終更新を `chrome.storage.local` に保存し、`GET_BLOCKLIST_STATUS` メッセージで公開。dashboard/popup に「Blocklist: N · updated X ago」を表示し、最終更新が7日超 or 直近 fetch 失敗なら警告表示。スキャンは鮮度でブロックしない(fail-safe)。
   - **残課題(別件)**: 上流署名による真の改竄検出(1)、第二フィードによる corroboration(2)は上記の通り意図的に見送り。スナップショットの視覚表示と実機での通知/フォント/アイコン確認はブラウザ実機検証が必要。

---

## プライバシー / 供給網

### F-5: popup の Google Fonts 外部読み込み — ✅ 実装済み
- **決定**: 第三者へのリクエストを排除する。**ローカル同梱(WOFF2)は採用せず、システムフォントスタックに統一**。理由: バイナリのフォント blob は CI/PR でレビューできず、供給網トラスト重視のセキュリティ製品には逆効果。検証可能性も優先。
- **実装**: `popup.html` のリモート `<link>`(preconnect×2+stylesheet)を削除、`popup.css` を dashboard と同じシステムスタック化、`POPUP_REDESIGN.md` 更新。
- **CSP の調整(決定仕様からの修正)**: manifest に `content_security_policy.extension_pages` を追加したが、**`style-src 'self'; font-src 'self'` のみ**に絞った。決定案の `connect-src 'self'` は MV3 では service worker にも適用されるため**ブロックリスト取得(raw.githubusercontent.com)を遮断**してしまい、`img-src 'self' data:` は拡張アイコンの `chrome://extension-icon/...` を遮断する。フォント漏洩の遮断に必要十分な範囲に留め、コア機能を壊さないことを優先(実機検証不可のため)。回帰テストで「popup に外部参照なし」「CSP に font-src/style-src 'self' あり・connect-src 制限なし」を固定。

### E-5: release.yml の dispatch publish バイパス — ✅ 実装済み
- **決定**: 修正する(供給網トラストに直結)。死んだ `version` input の削除だけでは不十分で、`Create GitHub Release` にガードが無く、ブランチからの `workflow_dispatch` がタグ/manifest 検証を**バイパスして未検証アーティファクトを公開**できた。
- **実装**: 未使用 input 削除、publish を `if: startsWith(github.ref, 'refs/tags/')` で検証ステップと同一条件にゲート、`tag_name: ${{ github.ref_name }}` を明示ピン。dispatch はビルド/検証の dry run に限定。**残課題(別件)**: 署名/provenance(SLSA/Sigstore)は未対応。リリースノートの SHA-256 は同一ワークフローの自己申告であり、整合性アンカーではない。

---

## 機能セマンティクス

### Q1 / A-1: ブロックリスト取得先 — ✅ 解決済み(2026-06-14)
`The-Privacy-Commons-Institute/chrome-mal-ids` の `data/current-list.json`(権威的後継、3000+ Chrome IOC、日次更新、CC BY 4.0、CORS `*`)に切替済み。`parseBlocklist` を新スキーマ対応に差し替え、実データでエンドツーエンド検証済み。詳細は上記 F-4 と git 履歴。

### Q2 / A-7: Allowlist / Dismiss セマンティクス — ✅ 実装済み(コア)
- **決定(fail-safe 最優先)**:
  1. **ガードレール(最重要)**: 既知悪性(blocklist/100/critical)拡張は **allowlist/dismiss で一切無効化できない**。UI で hard refusal、かつ通知側でも再判定(ストレージ改竄でも隠せない)。
  2. **dismiss = 通知の抑制のみ**。バッジ・一覧・スコアは不変。
  3. **allowlist = 通知抑制 + popup 脅威一覧から除外**。ただし dashboard には「Allowlisted」タグ + Undo で**可視・可逆**に残す。保存スコア/findings は不変(透明性)。
  4. **バッジは常に full count**(最後の正直なシグナルはユーザー操作で消さない)。
  5. **順序バグ修正 + 昇格通知**。
- **実装**: `classification.ts`(`isBlocklisted`/`riskOrdinal`)、`notifier.ts` を「初出 OR リスク昇格で通知/未変化は再通知しない/blocklist は常時通知/suppression は初出のみ抑制(昇格は抑制を貫通)」に書き換え。dashboard にタグ+Undo+blocklist 拒否、popup に allowlist 除外。テスト追加。
- **スコープの簡略化(ストレージ移行の回避)**: 決定仕様の「allow 時のリスク/スコアを保存して厳密に re-arm」は `UserPreferences` の形状変更(`Stop And Ask` 該当)を伴うため見送り、**「昇格は suppression を常に貫通して通知する」**という等価でより fail-safe な簡略版を採用。これによりストレージ移行なしで「allowlist が後の悪化を隠せない」を達成。厳密な状態保存版は将来の拡張(オーナー承認の上で `UserPreferences` にバージョン付き移行)に残す。

---

## 構造的負債

### C-8 / Q9: ScoredExtension の書き込み専用フィールド — 📝 現状維持
- **決定**: 保持。`description`/`type`/`homepageUrl`/`updateUrl` と重複 `scannedAt` は拡張自身の公開メタデータであり、origin-scoped な `chrome.storage.local` に置いても PII・秘密・攻撃者有用情報の漏洩はない(`chrome.management` で再取得可能)。スコアリング・閾値・blocklist・通知・バッジのいずれにも作用せず、検出を弱めも偽装もしない。削除は無益で、保存形状変更のリスク(検証経路の新バグ面)だけ生む。将来の詳細表示や F-3 で `updateUrl`/`homepageUrl` を使う可能性もあり、前方互換で保持が妥当。型に「予約(未読込)」注記のみ。

### D-5: ScoringRule が ExtensionInfo に直結 — 📝 現状維持
- **決定**: 直結を維持。ルールの入力 `chrome.management.getAll()` は**信頼できる一次 API**であり、検証が要る境界(ネットワーク=A-4、ストレージ=D-4)は別途検証済み。手書きアダプタはサニタイズ価値ゼロで、フィールドの無言ドロップ=**fail-open**(例: `mayDisable` 取り違えで cannot-disable ルールを無効化)を tsc エラーなしに生む純負債。Chrome 型を単一の真実源にすることでフィールド改名/削除が tsc で検出される。ルールは flat な 9 フィールドしか参照しない(grep 確認済み)。将来「第二のデータ源」or「テストフィクスチャ負担」が出たら、**実 ExtensionInfo から導出する `Pick<>` 構造型**(無言ドロップ不可)で再検討。

---

## 製品化前レビュー(敵対的)

実装後、新規ロジックの**正しさ**(設計の是非ではなく実装バグ)を多視点+敵対的検証でレビューした。確定5件のうち4件を修正、1件は仕様外の誤検知として却下せず「修正」、計5件すべて対処済み。誤検知5件は却下(うち2件は「通知マスタースイッチOFF時に既知悪性も通知されない」を bug と主張したが、ガードレールは allowlist/dismiss と改竄に限定する確定仕様であり、バッジ・一覧では脅威は可視のまま=誤検知)。

- **(HIGH) 既知悪性ガードレールの抜け穴**: 権限等で既に red の拡張が後からブロックリスト入りすると、`worsened` が粗い risk level しか見ないため通知されなかった。**修正**: newly-blocklisted を独立した昇格シグナルとして扱い「Known Malware Confirmed」を通知(マスタースイッチは確定仕様どおり尊重)。
- **(LOW) wildcard-subdomain 誤検知**: `/*.json` のようなパスグロブの `*.` を誤って subdomain ワイルドカード判定。**修正**: 生パターンでなくホスト authority で判定(F-2 のホストパースと整合)。
- **(LOW) 鮮度表示の不正確さ2件**: ①pre-status 版からのアップグレード後、フレッシュキャッシュ提供時に status 未記録で誤って「stale」表示。②フォールバック稼働中に「0 entries」表示。**修正**: フレッシュキャッシュ提供時に status を記録、catch 時の count を実提供リストのサイズに。
- **(LOW) status の RMW 競合**: 同一 tick の並行 recordStatus が field を上書きし得る(metadata のみ・自己回復するが)。**修正**: status 書き込みを単一プロミスチェーンで直列化。

## ロバスト性(非セキュリティ)

### B-7: getElementById の非null アサーション — ✅ 実装済み
- **決定**: `mustGetElement` ヘルパー導入。`!`/`as` はビルドで消去され、HTML id ドリフト時に「どの id が欠けたか」不明な遅延 null-deref になる。共有ヘルパーで起動時に id 入りで即 throw(自前の静的 HTML に対する fail-fast、ユーザーには fail-closed=半端な UI を見せない)。挙動保存。テスト追加。
