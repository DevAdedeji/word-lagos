# Word Lagos

A mobile-first word board game, built as the solo milestone for a future LagosLife integration.

## Run locally

Requires Node.js 24+ and npm.

```sh
npm ci
npm run dictionary
npm run dev
```

Open http://127.0.0.1:43127. To use another port: `npm run dev -w @word-lagos/web -- --port 43128`.

## Available now

- Play against Ayo, a friendly computer opponent.
- A 15×15 board, 100-tile bag, seven-tile rack, blanks, letter/word premiums, cross-word validation, and seven-tile bonuses.
- Tap-to-place on mobile; mouse dragging and keyboard-accessible buttons on desktop.
- A full-screen mobile game with a full-width board by default, zoom and pan, larger tiles, a pinned rack with safe-area support, and a prominent Submit action. Rounded green/red outlines enclose valid/invalid words directly on the board, with score markers attached.
- Recall, shuffle, swap, pass, word lookup, move history, endgame settlement, and new-game confirmation.
- Local saves after every completed turn. Pending tile arrangements are intentionally not saved. Reloading during Ayo’s turn restarts its move search.
- The computer searches legal moves in a Web Worker, with a retry action if computation fails. It chooses a middling scoring move for a gentler opponent.

## Stack and structure

React, Vite, TypeScript, Tailwind CSS v4, Lucide icons, Zod, Vitest, oxlint, and oxfmt. Tailwind utilities and component-layer `@apply` rules handle shared styling; custom CSS handles the board geometry, tile treatments, and responsive rack.

```text
apps/web/src/             React interface, worker, and validated local saves
packages/game-core/src/  Pure rules, scoring, game lifecycle, and bot search
scripts/                 Dictionary preparation
```

The shared engine has no React, browser, or database dependencies. It can later run on an authoritative multiplayer server.

## Checks

```sh
npm run lint          # oxlint, warnings fail
npm run format        # oxfmt writes formatting
npm run format:check  # oxfmt checks formatting
npm run test          # rules, bot, full-dictionary game, and saved-game tests
npm run build         # dictionary generation, TypeScript check, production build
npm run verify        # all release checks
```

Browser smoke checks: play a valid centre word and observe the computer reply; place an invalid word and verify Submit is disabled; recall tiles; swap; use word lookup; reload and verify scores persist; start a new match against Ayo; verify six consecutive scoreless turns finish a game. At 375×812 and 320×740, verify the board fills the width and scrolls vertically in short embeds, zoom/pan enlarges the squares, the rack stays pinned, and dialogs appear above it.

For a development-only iframe check, open `http://127.0.0.1:43127/embed-preview.html`. It reserves a 56px host bar and uses the sandbox permissions documented by LagosLife. This simulates the available space; actual Vatar sandbox integration remains a separate milestone.

## Dictionary

The build uses **word-list 4.1.0**, pinned in package.json and package-lock.json. It contains 269,870 alphabetic entries of length 2–15 after filtering. This is a casual English word list, not an official Scrabble tournament dictionary. Dictionary source licensing and credits are copied to `apps/web/public/dictionary-license.txt` and shipped with the game. Regenerate with `npm run dictionary` after installing dependencies. The generated word file is ignored by Git and regenerated for production builds.

## Next milestone

Friend matches, Node.js/Colyseus rooms, PostgreSQL/Drizzle persistence, and Vatar SDK integration are not implemented yet. Those should verify LagosLife sessions on the server, keep racks private, commit moves atomically, recover from disconnects, and report signed results. Current scores and saves are browser-local and are not suitable for a competitive leaderboard.

No platform keys or database credentials are required for this solo version. It has not been deployed or submitted to LagosLife. Fonts load from Google Fonts with local fallbacks.
