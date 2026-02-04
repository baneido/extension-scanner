# Extension Scanner 🛡️

<div align="center">

**Chrome Extension Threat Detector**

A modern Chrome extension that monitors and detects potentially malicious browser extensions using a rule-based scoring system.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-88%2B-green.svg)](https://www.google.com/chrome/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

[English](#english) | [日本語](#日本語)

</div>

---

## English

### 📋 Overview

Extension Scanner is a security-focused Chrome extension that helps protect your browser by analyzing installed extensions for potential threats. It uses a sophisticated rule-based scoring system to evaluate extension permissions, metadata, and blocklist status, then classifies each extension as safe, medium risk, or high risk.

### ✨ Features

- 🔍 **Automated Scanning**: Periodic scans every hour to detect new threats
- 🎯 **Risk Classification**: Three-tier system (Safe/Medium/High Risk)
- 📊 **Real-time Dashboard**: Modern cyberpunk-themed UI with detailed threat analysis
- 🚨 **Threat Notifications**: Alerts when high-risk extensions are detected
- 🗂️ **Blocklist Integration**: Syncs with community-maintained malicious extension database
- ⚡ **Lightweight**: Minimal performance impact with efficient background scanning
- 🎨 **Modern UI**: Glassmorphic design with accessibility features (WCAG 2.1 AA)

### 🔐 Security Checks

The extension evaluates multiple risk factors:

1. **Blocklist Matching**: Checks against known malicious extension IDs
2. **Permissions Analysis**: Scores based on dangerous permissions (cookies, webRequest, tabs, etc.)
3. **Host Permissions**: Flags broad host access patterns (`<all_urls>`, `*://*/*`)
4. **Installation Type**: Identifies unpacked/development extensions
5. **Metadata Quality**: Validates presence of descriptions, homepages, and update URLs

### 🚀 Installation

#### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/baneido/extension-scanner.git
   cd extension-scanner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

### 📖 Usage

#### Quick Scan

1. Click the Extension Scanner icon in your toolbar
2. View the security status summary:
   - 🔴 **High Risk**: Extensions scoring ≥70 (immediate action recommended)
   - 🟡 **Medium Risk**: Extensions scoring 30-69 (review recommended)
   - 🟢 **Safe**: Extensions scoring <30
3. Click "Scan Now" to run an immediate scan
4. Click "Full Report" to open the detailed dashboard

#### Dashboard

The full dashboard provides:
- Complete list of all scanned extensions
- Individual risk scores and findings
- Detailed breakdown of triggered rules
- Extension metadata (version, permissions, install type)
- Quick actions to disable or remove risky extensions

#### Keyboard Shortcuts

- `Cmd/Ctrl + R`: Run scan
- `Cmd/Ctrl + D`: Open dashboard

### ⚙️ How It Works

#### Scoring System

Each extension is evaluated against multiple rules:

| Rule Category | Max Score | Examples |
|--------------|-----------|----------|
| Blocklist | 100 | Known malicious extension ID |
| Permissions | Variable | `cookies` (15pts), `webRequest` (20pts) |
| Host Permissions | Variable | `<all_urls>` (20pts), `*://*/*` (15pts) |
| Install Type | 20 | Unpacked/development installation |
| Metadata | Variable | Missing description (5pts), no homepage (3pts) |

**Risk Thresholds:**
- Red (High Risk): ≥70 points
- Yellow (Medium Risk): 30-69 points
- Green (Safe): <30 points

#### Blocklist Source

The extension fetches the latest malicious extension IDs from:
- Primary: [chrome-mal-ids](https://github.com/nicoleahmed/chrome-mal-ids) (updated daily)
- Fallback: Local cache with embedded defaults

### 🛠️ Development

#### Project Structure

```
extension-scanner/
├── src/
│   ├── background/       # Service worker
│   │   └── service-worker.ts
│   ├── popup/            # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.ts
│   ├── dashboard/        # Full-page dashboard
│   │   ├── dashboard.html
│   │   ├── dashboard.css
│   │   └── dashboard.ts
│   ├── scoring/          # Risk scoring engine
│   │   ├── engine.ts
│   │   ├── types.ts
│   │   └── rules/
│   │       ├── blocklist.ts
│   │       ├── permissions.ts
│   │       ├── host-permissions.ts
│   │       ├── install-type.ts
│   │       └── metadata.ts
│   ├── data/             # Blocklist & pattern data
│   ├── storage/          # Chrome storage helpers
│   ├── alerts/           # Notification system
│   └── shared/           # Types & constants
├── public/
│   ├── manifest.json
│   └── icons/
└── dist/                 # Build output
```

#### Commands

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build
```

#### Adding New Rules

1. Create a new file in `src/scoring/rules/`
2. Implement the `ScoringRule` interface:
   ```typescript
   export interface ScoringRule {
     id: string;
     category: string;
     evaluate(ext: chrome.management.ExtensionInfo): RuleResult[];
   }
   ```
3. Export your rule from `src/scoring/rules/index.ts`
4. Update thresholds in `src/shared/constants.ts` if needed

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

### 🧪 Testing

Currently manual testing is performed:

1. Load the extension in Chrome
2. Install test extensions (both safe and known malicious)
3. Verify risk scores and classifications
4. Check dashboard functionality
5. Test notification system

Automated testing suite planned for future releases.

### 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### 🙏 Acknowledgments

- [chrome-mal-ids](https://github.com/nicoleahmed/chrome-mal-ids) - Community-maintained malicious extension database
- [Heroicons](https://heroicons.com/) - Beautiful SVG icons
- [Fira Code](https://github.com/tonsky/FiraCode) & [Fira Sans](https://fonts.google.com/specimen/Fira+Sans) - Typography

### ⚠️ Disclaimer

This tool provides risk assessment based on heuristics and known malicious patterns. It is not a substitute for security best practices. Always review extension permissions and sources before installation.

---

## 日本語

### 📋 概要

Extension Scannerは、インストールされているChrome拡張機能を分析し、潜在的な脅威を検出するセキュリティ重視の拡張機能です。高度なルールベースのスコアリングシステムを使用して、拡張機能の権限、メタデータ、ブロックリストのステータスを評価し、各拡張機能を安全、中リスク、または高リスクに分類します。

### ✨ 機能

- 🔍 **自動スキャン**: 1時間ごとの定期スキャンで新しい脅威を検出
- 🎯 **リスク分類**: 3段階のリスク評価システム（安全/中リスク/高リスク）
- 📊 **リアルタイムダッシュボード**: サイバーパンクテーマの現代的なUIで詳細な脅威分析
- 🚨 **脅威通知**: 高リスクの拡張機能が検出されたときにアラート
- 🗂️ **ブロックリスト統合**: コミュニティが管理する悪意のある拡張機能データベースと同期
- ⚡ **軽量**: 効率的なバックグラウンドスキャンでパフォーマンスへの影響を最小限に
- 🎨 **モダンUI**: アクセシビリティ機能を備えたグラスモーフィックデザイン（WCAG 2.1 AA準拠）

### 🔐 セキュリティチェック項目

拡張機能は以下の複数のリスク要因で評価されます：

1. **ブロックリスト照合**: 既知の悪意のある拡張機能IDとの照合
2. **権限分析**: 危険な権限（cookies、webRequest、tabsなど）に基づくスコアリング
3. **ホスト権限**: 広範なホストアクセスパターン（`<all_urls>`、`*://*/*`）のフラグ付け
4. **インストールタイプ**: 未パッケージ/開発版拡張機能の識別
5. **メタデータ品質**: 説明文、ホームページ、更新URLの存在確認

### 🚀 インストール方法

#### ソースからインストール

1. リポジトリをクローン:
   ```bash
   git clone https://github.com/baneido/extension-scanner.git
   cd extension-scanner
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. 拡張機能をビルド:
   ```bash
   npm run build
   ```

4. Chromeに読み込む:
   - `chrome://extensions`を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist/`フォルダを選択

### 📖 使い方

#### クイックスキャン

1. ツールバーのExtension Scannerアイコンをクリック
2. セキュリティステータスの概要を表示:
   - 🔴 **高リスク**: スコア≥70（即座の対応を推奨）
   - 🟡 **中リスク**: スコア30-69（確認を推奨）
   - 🟢 **安全**: スコア<30
3. 「Scan Now」をクリックして即座にスキャンを実行
4. 「Full Report」をクリックして詳細ダッシュボードを開く

#### ダッシュボード

詳細ダッシュボードでは以下が提供されます：
- スキャンされたすべての拡張機能の完全なリスト
- 個別のリスクスコアと検出結果
- トリガーされたルールの詳細な内訳
- 拡張機能のメタデータ（バージョン、権限、インストールタイプ）
- リスクのある拡張機能を無効化または削除するクイックアクション

#### キーボードショートカット

- `Cmd/Ctrl + R`: スキャン実行
- `Cmd/Ctrl + D`: ダッシュボードを開く

### ⚙️ 仕組み

#### スコアリングシステム

各拡張機能は複数のルールに対して評価されます：

| ルールカテゴリ | 最大スコア | 例 |
|--------------|-----------|---------|
| ブロックリスト | 100 | 既知の悪意のある拡張機能ID |
| 権限 | 可変 | `cookies` (15点), `webRequest` (20点) |
| ホスト権限 | 可変 | `<all_urls>` (20点), `*://*/*` (15点) |
| インストールタイプ | 20 | 未パッケージ/開発版インストール |
| メタデータ | 可変 | 説明文なし (5点), ホームページなし (3点) |

**リスク閾値:**
- 赤（高リスク）: ≥70点
- 黄（中リスク）: 30-69点
- 緑（安全）: <30点

#### ブロックリストのソース

拡張機能は以下から最新の悪意のある拡張機能IDを取得します：
- プライマリ: [chrome-mal-ids](https://github.com/nicoleahmed/chrome-mal-ids)（毎日更新）
- フォールバック: 埋め込みデフォルトを含むローカルキャッシュ

### 🛠️ 開発

#### プロジェクト構造

```
extension-scanner/
├── src/
│   ├── background/       # サービスワーカー
│   ├── popup/            # 拡張機能ポップアップUI
│   ├── dashboard/        # フルページダッシュボード
│   ├── scoring/          # リスクスコアリングエンジン
│   ├── data/             # ブロックリスト＆パターンデータ
│   ├── storage/          # Chromeストレージヘルパー
│   ├── alerts/           # 通知システム
│   └── shared/           # 型＆定数
├── public/
│   ├── manifest.json
│   └── icons/
└── dist/                 # ビルド出力
```

#### コマンド

```bash
# 開発モード（ウォッチモード）
npm run dev

# プロダクションビルド
npm run build
```

詳細なアーキテクチャドキュメントは[CLAUDE.md](CLAUDE.md)を参照してください。

### 📄 ライセンス

このプロジェクトはMITライセンスの下でライセンスされています - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

### ⚠️ 免責事項

このツールは、ヒューリスティックと既知の悪意のあるパターンに基づいてリスク評価を提供します。セキュリティのベストプラクティスの代替品ではありません。拡張機能をインストールする前に、常に権限とソースを確認してください。

---

<div align="center">

**Made with ❤️ for browser security**

[Report an Issue](https://github.com/baneido/extension-scanner/issues) · [Request a Feature](https://github.com/baneido/extension-scanner/issues)

</div>
