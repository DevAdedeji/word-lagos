# WordPadi

A mobile-first word board game for LagosLife: play against Ayo or invite a friend.

## Run locally

Requires Node.js 24+ and npm. From the repository root:

```sh
npm ci
npm run dictionary
npm run dev
```

In a second terminal:

```sh
npm run dev:server
```

Open http://127.0.0.1:43127. New game → Play a friend → Create a game produces a six-letter code. Open a second tab and choose Join with that code. Local tabs receive separate development player sessions; production uses LagosLife identities. Development tokens and the last match code use sessionStorage: reload retains your seat, but closing the tab may clear the development identity.

The server reads the root `.env`. Without `DATABASE_URL`, development uses an embedded PostgreSQL-compatible PGlite database in `apps/server/.data`. Both are ignored by Git. Add a Neon pooled connection string as `DATABASE_URL` to use PostgreSQL instead, retaining its SSL parameters. Use a separate Neon development branch for local work. Never prefix server secrets with `VITE_`.

## Available now

- Play against Ayo, with legal-move search in a Web Worker.
- Friendly two-player matches with invitation codes, private racks, live turn/score updates, automatic reconnect attempts and manual reconnect.
- Server validation of identity, membership, turn, tile ownership, words and scores. Revision checks and command receipts prevent concurrent or duplicate moves from being applied twice.
- Accepted multiplayer moves persist before acknowledgment. Disconnecting keeps the seat reserved; return with the same identity and code. Matches expire after seven days. There is no turn clock or disconnect forfeiture yet.
- A full-width, zoomable 15×15 board, personal 60-tile supplies (2 blanks, 28 vowels, 30 consonants each), premiums, crossing words and seven-tile bonuses.
- Phone-first layout with a pinned rack, prominent Submit, on-board word outlines, and recall/swap/pass icons with title-only tooltips.
- Local Ayo saves, word lookup, move history, endgame settlement and retry states.

My games lists your current Ayo game and active friend matches, with scores and turn indicators. Records shows completed friend games; head-to-head counts include all completed matches between the two players, with the latest 20 results shown. Active lists page in batches of 50.

Unsubmitted tile arrangements are saved per game in this browser tab, including across reloads, until the board revision changes. Ayo progress is saved on this device; friend games resume using the same authenticated identity. Multiplayer responses never include bag contents, the random generator state, or the opponent's rack. Client scoring previews are advisory; the server validates using its own dictionary and game state.

## Stack

React, Vite, TypeScript, Tailwind CSS v4, Lucide, Zod, Colyseus, Express, Drizzle, PostgreSQL, Vitest, oxlint and oxfmt. PGlite runs the same PostgreSQL table definitions in local development and automated tests.

```text
apps/web/src/                  Board, mobile UI, Ayo worker, local saves
apps/web/src/multiplayer/      Friend lobby, connection and session lifecycle
apps/server/src/               Auth, match rules, rooms, database and HTTP server
packages/game-core/src/        Shared scoring, game lifecycle and bot search
packages/multiplayer/src/      Validated client/server protocol
scripts/                      Dictionary preparation
```

## Railway + Neon deployment

Deploy **one Railway service** from `DevAdedeji/word-lagos`, using the repository root. The Dockerfile builds the web app; Node serves it on Railway's assigned `PORT`. `railway.json` configures the Docker build, `/health` check and one replica.

1. Initially set `AUTH_MODE=disabled`. Ayo works; multiplayer displays an unavailable message until LagosLife is connected. No platform secret is needed to obtain the public URL.
2. Generate a public HTTPS domain in Railway. Use the root URL in the LagosLife draft's **Game URL** field. The server sends the required `frame-ancestors` header without `X-Frame-Options`. Webhook URL can remain blank for this milestone.
3. Create a Neon database in a region near the Railway service. Add its complete pooled URL as `DATABASE_URL` in Railway Variables, retaining the supplied SSL settings. The local `.env` is excluded from Git and the Docker image.
4. Add `VATAR_SECRET` (test secret), `PUBLIC_ORIGIN` (exact Railway HTTPS origin, no trailing slash) and `AUTH_MODE=vatar` in Railway Variables. Redeploy.
5. Open the LagosLife sandbox to test real identities. `Vatar.init()` and `Vatar.session()` supply tokens; our server checks them through `/session/verify`, which verifies game ownership using the game-scoped secret. Our server also checks expiry and test/live mode. `VATAR_GAME_ID` is optional: if set, the returned ID must match. No second signup or third-party cookies are used.

Production rejects local development identities. Test, live and local games are isolated, even in a shared database. An initial additive schema is created at startup; future changes require versioned migrations.

### LagosLife integration

Embedded startup initializes the official hosted SDK and listens for pause/resume. Pausing suspends Ayo's worker and local turn input; server-owned multiplayer turns continue to persist. Standalone computer play remains available.

New LagosLife friendlies use zero-stake SDK matches. The backend verifies platform membership, environment, two seats and zero stake before importing a board. Existing seven-day friend games remain available; platform invitations expire after 15 minutes and games after two hours. Finished boards persist before a background worker signs and posts the final result. Failed deliveries retry from the database every 15 seconds. Expired platform matches cannot receive a late result.

Configure `VATAR_RESULTS_SECRET` alongside the matching `VATAR_SECRET` on Railway. Use test credentials for the draft, and replace both with the matching live credentials only after approval. Without a results secret, platform match creation is disabled.

The optional `sunset_board` product costs ₦500 and is a one-off cosmetic theme. Create it in the LagosLife dashboard with exactly that ID and price. Core gameplay is free. Purchase claims verify the session, provider purchase ID, owner, product, price, currency and mode. A unique purchase ledger grants ownership before acknowledging delivery; failed acknowledgments retry. Restore purchases recovers interrupted checkout and rechecks ownership/refunds. The checkout and payment details are handled only by LagosLife. No payment webhook is required for this integration.

Migration 1 runs transactionally at startup, adding a purchase ledger, unique platform-match binding and support for SDK alphanumeric codes. It preserves existing game/session rows. Rolling back application code leaves the additive ledger intact; an older server will not understand newly issued alphanumeric invitation codes. Keep the new protocol when rolling back a frontend-only change.

Before submission, verify SDK init, a real sandbox purchase/restore, and a completed platform friendly result in the developer checklist. Never simulate a delivered item or post a result for an unfinished board. The platform review still requires the developer's agreement and final submission.

Use **one application replica** for now. Room connections live in one Node process; database revision checks protect saved moves. A restart drops connections, which reauthenticate and recreate rooms from persisted matches. Horizontal scaling needs shared Colyseus presence and routing. On an unconfirmed move, reconnect to inspect the saved board before retrying. Do not expose local development authentication publicly.

## Checks

```sh
npm run lint
npm run format
npm run format:check
npm run test
npm run build
npm run verify
```

Tests cover game rules, bot play, local saves, multiplayer membership, rack privacy, turn validation, concurrent seat reservation, optimistic writes, duplicate commands, Vatar verification failures, environment isolation and actual WebSocket clients reconnecting. Database tests use PGlite; live Neon and LagosLife sandbox validation still require configuration.

Phone QA: http://127.0.0.1:43127/embed-preview.html provides a 390px iframe preview with a 56px host bar. Create/join from separate tabs, submit a word, check both scores, pass/swap on the active turn, and reload to resume. The board fills the width and scrolls in short embeds; the rack remains pinned.

## Dictionary

**word-list 4.1.0**, pinned in the lockfile, supplies 269,870 alphabetic entries of length 2–15. This is a casual English list, not an official tournament dictionary. Licensing ships in `apps/web/public/dictionary-license.txt`. The build regenerates the ignored `words.txt` for browser and server.

The active-game switcher and head-to-head records need to be deployed before using the new listing screenshots. The game has not been submitted to LagosLife. Fonts load from Google Fonts with local fallbacks.

## Local feature preview (not deployed)

My games includes a your-turn count, expiry clocks, rematches reserved for the same opponent,
and account statistics for friend games. Resigning ends a match immediately, even off-turn;
the other player wins regardless of the current scores. Completed games show a result screen.
Rematches use a fresh code to share with the same opponent; no invitation message is sent automatically.
Ayo games remain on the device and are excluded from account statistics and achievements.

Tiles support pointer dragging from rack to board, between empty board squares and back to
the rack before submission. Tap-to-place/recall remains available. Purple outlines identify
the opponent’s last placed tiles. A compact white highlight marks the active player; the opponent’s rack is shown as face-down tile backs using only its count. The rack shows all of the player's own unplayed tiles, including reserve and rack. New games start at 60 per player: vowels A6/E8/I6/O5/U3, two blanks and 30 consonants. Y is a consonant. Playing decreases this count; drawing, passing and exchanging do not. Games end when one player finishes their supply, after six scoreless turns, or on resignation. Older saved games retain their shared 100-tile bag rules; their counter is explicitly labelled shared.

The theme shop includes Classic (free), Sunset, Midnight, Ankara and Royal. Each paid theme
costs ₦500 once, with a read-only board preview before purchase. Real purchases are verified
and delivered by the server; separate product ownership is restored per account and environment.
Local authentication uses simulated unlocks held only in memory, never a payment provider.

Before an authorized release, create and approve `midnight_board`, `ankara_board`, and
`royal_board` as ₦500 one-off cosmetic products in the LagosLife dashboard. These products
have not been created as part of the local preview. Test each provider checkout, restore and
native rematch in the sandbox before enabling the new catalog publicly. No new environment
variables are required. Startup migration 2 adds a unique rematch index; it has only been
exercised in local tests, not applied to production. Existing Sunset purchases remain valid.

The personal-supply marker is stored with each game. Existing records need no conversion. Deploy client and server together for the new snapshot count. Older server code cannot safely resume personal-supply games; do not roll back to a version that strips the marker.

## Diamonds (local preview)

Play word costs 10 diamonds and automatically submits the highest-scoring legal move
found using the game dictionary, including premiums, crosswords and the seven-tile bonus.
It replaces unsubmitted tiles and ends the player's turn. No valid move or a failed search
costs nothing. Each account receives 10 welcome diamonds once per environment.

Repeatable packs are `diamonds_100` (100 for ₦500), `diamonds_250` (250 for ₦1,000),
and `diamonds_700` (700 for ₦2,500). Create and approve these consumable products in
LagosLife before enabling real purchases. Local preview packs are simulated. Actual
provider checkout for these packs has not yet been tested. No new environment variables
are needed beyond the existing purchase integration. Stakes remain disabled.

Startup migration 3 adds wallets and an idempotent ledger, separated by account and
local/test/live environment. Friend-game submission and diamond spending commit together.
Recover previous play retries a paid position without another charge; computer games
remain device-local. Verified refunds reverse the original credit once, including a debt
if the diamonds have already been spent. Future credits settle that balance.
