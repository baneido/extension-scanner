# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Manifest V3 extension that detects potentially malicious browser extensions by analyzing permissions, metadata, and blocklists. The extension monitors installed extensions and assigns risk scores based on configurable rules.

## Build & Development Commands

### Building
```bash
npm run build        # Production build to dist/
npm run dev          # Development build with file watching
```

### Loading Extension
After building, load the unpacked extension from the `dist/` directory in Chrome via `chrome://extensions` (enable Developer Mode).

## Architecture

### Core Components

**Background Service Worker** (`src/background/service-worker.ts`)
- Entry point for all extension lifecycle events
- Registers all event listeners synchronously at module scope (Manifest V3 requirement)
- Manages periodic scans via `chrome.alarms` API
- Coordinates blocklist updates and threat detection
- Handles messages from popup/dashboard UI

**Scoring Engine** (`src/scoring/engine.ts`)
- `scoreExtension()`: Evaluates a single extension against all rules
- `runFullScan()`: Scans all installed extensions and classifies risk levels
- Risk classification: green (<30), yellow (30-69), red (≥70)

**Rule System** (`src/scoring/rules/`)
- Modular rule evaluation architecture
- Each rule implements `ScoringRule` interface with `evaluate()` method
- Rules return `RuleResult[]` with score, severity, and description
- Active rules:
  - `blocklist`: Matches against known malicious extension IDs (100 points)
  - `permissions`: Scores based on dangerous permissions (configurable weights)
  - `host-permissions`: Evaluates broad host access patterns
  - `install-type`: Flags unpacked/development extensions
  - `metadata`: Checks for missing descriptions, homepages, etc.

### Data Flow

1. Service worker initializes blocklist from remote source or cache
2. Triggers scan on install, startup, alarms, or extension changes
3. Engine evaluates each extension through all rules
4. Results stored in `chrome.storage.local` and displayed in popup/dashboard
5. Badge updated with threat count; notifications sent for new threats

### Key Data Types

**ScoredExtension** (`src/shared/types.ts`)
- Extension metadata + `totalScore`, `riskLevel`, `ruleResults[]`

**ScanResult**
- Array of `ScoredExtension` plus summary counts (total/red/yellow/green)

**BlocklistEntry** (`src/data/blocklist-fetcher.ts`)
- Maps extension IDs to blocklist reason and source

### Blocklist Management

- Primary source: GitHub repo `nicoleahmed/chrome-mal-ids` (daily updates)
- Fallback: Local `blocklist-fallback.ts` if network fails
- Cache: Stored in `chrome.storage.local` with 24-hour TTL
- Updates: Automatic via alarm or manual via popup "Scan Now"

## Important Constraints

### Manifest V3 Requirements
- All event listeners **must** be registered synchronously at module top-level
- No dynamic listener registration in async callbacks
- Service worker may terminate; use `chrome.storage` for persistence

### Vite Build Configuration
- Custom plugin (`flattenHtmlPlugin`) moves HTML from nested `src/` dirs to `dist/` root
- Fixes relative asset paths after flattening
- Output structure: `dist/service-worker.js`, `dist/popup.html`, `dist/dashboard.html`
- Assets go to `dist/assets/`, chunks to `dist/chunks/`

## TypeScript Configuration

- Target: ES2022 with strict mode
- Module resolution: bundler (Vite-compatible)
- Chrome types via `chrome-types` package
- `noUncheckedIndexedAccess: true` for array safety

## Adding New Rules

1. Create new file in `src/scoring/rules/` implementing `ScoringRule` interface
2. Export rule instance from `src/scoring/rules/index.ts` in `allRules` array
3. Define scoring logic in `evaluate()` method returning `RuleResult[]`
4. Use severity levels: `critical` (50-100), `high` (20-49), `medium` (10-19), `low` (1-9), `info` (0)

## Common Patterns

### Storage Access
Use helper functions in `src/storage/store.ts`:
- `saveScanResult()` / `loadScanResult()`
- Consistent key naming via `STORAGE_KEYS` constants

### Thresholds & Constants
All magic numbers defined in `src/shared/constants.ts`:
- `THRESHOLDS.RED` / `THRESHOLDS.YELLOW`
- `SCAN_INTERVAL_MINUTES`
- `BLOCKLIST_UPDATE_INTERVAL_MINUTES`

### Message Passing
Service worker handles:
- `GET_SCAN_RESULT`: Returns latest scan
- `RUN_SCAN`: Triggers immediate scan
- `OPEN_DASHBOARD`: Opens full-page dashboard
