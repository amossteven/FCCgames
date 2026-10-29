# Putting FCC Games inside the members' chat

Two kinds of game: **Pop & Clap** is turn-based and played inside the conversation; **Clappy** is a solo arcade game that opens in a popup and feeds a high-score board (second half of this document).

How the five games plug into the Film Crew Collective website's conversations, using the same
Gamepad button that already offers Overtime, with the FCC games listed above the Overtime entries.

## Where things stand (28 Oct 2026)

| Piece | Status |
|---|---|
| **Pop & Clap** (Connect Four, clapperboards vs popcorn) in a compact board-only layout for the chat | **Done.** The other four games are shelved in `games/` for later. |
| Games as their own Railway service | **Config done** (`package.json`, `railway.json`, `serve.json`). Needs no variables; Railway supplies `PORT`. |
| Embed mode: site hosts a game in a frame, names pre-filled, moves sent back, new state pushed in live | **Done** in `shared/fcc.js`. Reference parent page: `docs/embed-demo.html` |
| Website side (menu, folding card, result cards, Scoreboard view and pop-up, live updates) | **Built and tested** by the FCC design session in the FCC working tree (not committed or deployed; Steve decides). |
| `frame-ancestors` header on the games service (`serve.json`) | **Done** for filmcrewcollective.com / .co.uk (www and apex) and localhost. Only the Railway service sends headers; GitHub Pages can't. |
| Deploy the games service and set `FCC_GAMES_URL` on the site's Railway service **before** the site is built (its CSP `frame-src` is fixed at build time) | **Done 28 Oct.** Site side live at www.filmcrewcollective.co.uk; games at https://fccgames.up.railway.app (deployed with `railway up`; the GitHub trigger on the Railway service still needs reconnecting). |
| **Clappy** (solo 8-bit arcade game, popup not card) | **Game live** at the games service (`games/clappy.html`). **Website side built and tested** by the FCC design session (menu entry, popup, `/games/clappy` scoreboard, billy's record posts), not committed or deployed; Steve decides. See [Clappy](#clappy-solo-arcade-game-in-a-popup). |

## The experience we're building (tested in the mock on 26 Oct)

Members play **inside the conversation**. No links are sent.

1. In a conversation, the Gamepad button's menu reads: **Play a game** — 🎬 Pop & Clap · 🏆 Scoreboard — then **Invite to Overtime** — Duel · Co-op (unchanged).
2. Picking Pop & Clap puts a **game card** at the top of the thread, pinned while the game is on. It's a dropdown: an orange bar with the game name and a status pill ("Your move" / "Waiting for Jo") and a chevron. The starter sees it open and plays the first move; the other member sees it **closed and flashing** until they tap it, play, and it goes quiet again. Inside is just the board, a Director's Cut button and a "How to play" fold — no name form, no turn banner, no last-move panel.
3. Each move marks the conversation unread for the other member (nav badge, the usual message email once per unread run). The per-move nudge messages are not drawn in the thread: the flashing card is the signal. Only "Steve started Pop & Clap" and the result line show.
4. With the conversation open on both sides, the thread's poll pushes the new state into the open card: no reload.
5. When the game ends the card stops being pinned and stays **in the thread, closed**, its bar showing the result ("You won" / "Jo won" / "Draw"). Opening it shows the final board and a Rematch button (loser starts).
6. **Scoreboard** (from the Gamepad menu) is a view inside the chat window, like the Messages list: head-to-head total between the two members, per-game wins/draws/losses, recent results and a streak.

## How the game page talks to the site (already implemented)

The site opens a game in an `<iframe>` at

```
${FCC_GAMES_URL}/games/<file>.html?embed=1&origin=<site origin>&p0=<name A>&p1=<name B>&me=<0|1>[&new=1]#<state>
```

| Parameter | Meaning |
|---|---|
| `embed=1` | Hide the launcher chrome, send moves to the parent instead of showing the copy panel |
| `origin` | The site's origin; messages are only posted to it |
| `p0`, `p1` | Player names. Seat 0 is whoever started the game and always moves first |
| `me` | The viewer's seat. If it isn't their turn they see a "Waiting for…" screen and can't move |
| `new=1` | Start a fresh game (first move). Otherwise the state comes from the `#` fragment |
| `#state` | base64url of the JSON state the site saved from the last move (Node: `Buffer.from(JSON.stringify(state)).toString('base64url')`) |

Game files: `telly-trumps`, `channel-hopper`, `clapperboard-connect`, `spoiler-alert`, `bank-it`.

Messages the frame posts to the parent (`event.data.v === 1`, always check `event.origin === FCC_GAMES_URL`):

| `type` | When | Fields |
|---|---|---|
| `fcc:ready` | page loaded | `game`, `id` |
| `fcc:height` | content height changed | `height` (px) — set the iframe height to it |
| `fcc:move` | the viewer made a move | `game`, `title`, `emoji`, `id`, `turn`, `text` (one-line summary for the chat), `next` (seat to move, or `null` when over), `over` (`{winner: 0|1|null, reason}` or `null`), `players`, `state` (opaque JSON, save it as-is; under 4 KB) |
| `fcc:rematch` | Rematch pressed on the result screen | `game` — start a new game in the same conversation |

Message the parent posts **to** the frame (`frame.contentWindow.postMessage(msg, FCC_GAMES_URL)`):

| `type` | When | Fields |
|---|---|---|
| `fcc:load` | the other player has moved (the thread poll saw a newer `turn`) | `v: 1`, `state` (the saved state), `me` (the viewer's seat). The game re-renders in place and chimes if it's now the viewer's move |

The state is opaque to the site. What the site actually does with a move (as built): checks `state` is an object under 8 KB with `state.g === "popclap"`, saves `state` and `over`, and works out the next player itself because Pop & Clap alternates, so the game's `next` field is ignored. A refused move is answered by pushing the saved state back into the frame with `fcc:load`, so the board can't drift. The iframe is sandboxed (`allow-scripts allow-same-origin`, `allow="autoplay"`): localStorage works, top-level navigation and popups from the game are blocked. **The protocol below is frozen**: `fcc:ready`, `fcc:height {height}`, `fcc:move {state, over}`, `fcc:rematch` out; `fcc:load {state, me}` in. Any change must be agreed with the site first.

## Website work, in order

### 1. Settings
- `FCC_GAMES_URL` — the games service address (Railway or a custom domain such as `games.filmcrewcollective.co.uk`). Add to `.env.example` next to `OVERTIME_URL` and to the site's Railway variables. The games service itself needs no variables.
- Plan gating: a `fcc_games` feature in `planFeatureDefaults.ts`. Suggest `{ basic: true, pro: true, ultimate: true }` — these games are light and a good reason for free members to open the chat.
- Once the site's domain is final, add a `Content-Security-Policy: frame-ancestors` header for it in the games repo's `serve.json`, so nobody else can frame the games.

### 2. Database (Prisma)
```prisma
model ChatGame {
  id             String    @id            // short code from the room-code alphabet
  game           String                   // "trumps" | "hopper" | "connect" | "spoiler" | "bankit"
  conversationId String
  playerAId      String                   // seat 0, started the game, moves first
  playerBId      String                   // seat 1
  state          Json?                    // opaque; null until the first move
  turn           Int       @default(0)    // bumps on every move: the thread poll compares it
  nextPlayerId   String?                  // null when finished
  winnerId       String?
  finishedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([conversationId, finishedAt])
  @@index([nextPlayerId])
}
```
Plus a `gameId String?` on `Message` for the start line, the turn-nudge lines and the result line, so the thread can render them as pins instead of bubbles.

### 3. `src/lib/fccGames.ts` (server only), modelled on `overtimeInvite.ts`
- `FCC_GAMES` catalogue: `{ id, file, title, emoji, blurb }` for the five games.
- `startChatGame(me, conversationId, gameId)` — checks the conversation is mine and the feature is on for both; one active game per conversation (otherwise returns the active one); rate limit (reuse `overtime:invite`); creates the `ChatGame` row with `state: null`; posts a pin message *"🃏 Steve started Telly Trumps"* with `gameId` set. Returns `{ ok, game }`.
- `submitChatMove(me, id, payload)` — loads the row; rejects if I'm not a player, the game is finished, or it isn't my seat's turn (`state === null` → seat 0, else `state.n`); checks `payload.state` is an object under 8 KB and `payload.text` under 300 chars; saves `state`, `turn + 1`, `nextPlayerId`, `winnerId`, `finishedAt`. Then the **nudge**: posts a pin message from me with `gameId` — *"🃏 Steve played · your move"* while the game is on, *"🏆 Jo won Telly Trumps"* / *"🤝 Telly Trumps was a draw"* at the end. Because it's a message, it drives the unread count, the nav badge and the email (`notifyMessages`, once per unread run) with no new plumbing. Add a `notifyGames` switch to `NOTIFICATION_OPTIONS` if you want game nudges to be separately silenced.
- `activeGameFor(conversationId, me)` and `gameState(id, me)` — what the card needs: names, my seat, state, turn, whether it's my move.

### 4. Server actions in `src/app/chat/actions.ts`
`startFccGame(conversationId, gameId)`, `submitFccMove(id, payload)`, `fccGameState(id)`; thin wrappers like `inviteToOvertime`.

### 5. Chat UI
- **Menu**: extend `OvertimeInviteMenu.tsx` into a game menu with two sections, FCC games first (emoji, title, one-line blurb), Overtime below. Picking a game calls `startFccGame` and the thread refreshes: the card appears. If a game is already active the entry reads "Resume".
- **Game card** (`GameCard.tsx`, client): rendered by `ChatThreadView.tsx` pinned above the message list while `activeGame` is set (and by the Messages page thread the same way). It holds the iframe built from the URL above (names from `senderDisplayName`, my seat, saved state or `new=1`), listens for `message` events from `FCC_GAMES_URL` only, calls `submitFccMove` on `fcc:move`, sets its own height on `fcc:height`, calls `startFccGame` on `fcc:rematch`. The thread's existing `usePoll` payload includes the active game's `{id, turn, nextPlayerId}`; when `turn` is newer than what the card has, the card fetches `fccGameState(id)` and posts `fcc:load` into the frame.
- **Pin lines**: messages with `gameId` render as a thin centred line (emoji + text, no bubble, no button) in `ChatThreadView` and the Messages pages; `messagePreview` uses the same text for the conversation list ("🃏 Steve played · your move").
- The chat widget column is narrow; the games already lay out at phone width (tiles, grids and cards all tested at 375 px).

### 6. Card behaviour, pinning and the scoreboard
- One active game per conversation; the menu entry reads "Resume" while one is on.
- The live card is "render the active game above the list"; its open/closed state is per browser (sessionStorage), closed by default except for the starter's first move. Flashing = `nextPlayerId === me && closed`.
- Finished games: render the result pin message as the folded card (the `ChatGame` row has the final state); load its frame only when opened.
- Scoreboard: a `scoreboardFor(me, otherId)` query over finished `ChatGame` rows for the pair, shown as a view in the chat window (header "Scoreboard", back arrow returns to the thread). The mock's `/api/scoreboard` shows the shape: totals, per game, recent, streak.
- Games ended early ("End game" in the card footer) get an "ended early" pin line and don't count on the scoreboard.

### 7. Test and ship
Two accounts, two browsers, one conversation open in both: start each of the five games from the menu; play a full game of Clapperboard Connect (quickest) and watch the other browser's card update without a reload; check the nudge line, the unread badge and the email arrive for the other member; check the "Waiting for…" screen on the wrong seat; check the result line and Rematch; check it all in the chat widget as well as the Messages page.

## Decisions for Steve
- **Nudges**: each move leaves a thin pin line and marks the conversation unread. Emails follow the existing once-per-unread-run rule, so a member who isn't on the site gets one email, not one per move. Add a separate `notifyGames` switch, or leave them under Messages?
- **Who can play**: all plans (suggested) or Pro and above like Overtime multiplayer.
- **Domain**: keep the Railway address or add `games.` on the FCC domain (nicer in links, and needed for the frame-ancestors header).

## Later
- `/members/games` lobby: games where it's your move, recent results, a leaderboard per game.
- "Your move" count on the Gamepad icon or the Messages nav item.
- More games on the same engine (each is a single HTML file; the site needs only a catalogue entry).


---

# Clappy: solo arcade game in a popup

Clappy is Steve's 8-bit "film set flyer": tap or press Space to hop the clapperboard past boom poles, lamps, flight
cases and camera cranes, grab trophies (every tenth one gives a power-up), and beat your best. It's a one-player,
portrait, 9:16 canvas game, so it does **not** play inside the thread. It opens in a popup over the page and
sends its score to the site when a run ends. File: `games/clappy.html` (served at `${FCC_GAMES_URL}/games/clappy.html`).

## The experience

1. **From the chat.** The Gamepad menu reads **Play a game** — 🎬 Pop & Clap · 🕹️ Clappy · 🏆 Scoreboard — then the Overtime entries. Clappy opens the popup (a page-level portal, not inside the 384 px widget).
2. **The popup.** Phones (under 768 px): full screen, 100vw × 100dvh, portrait, no chrome; the game's own **EXIT** button (top-left, only shown in embed mode) closes it. Tablet and desktop: a centred 9:16 modal, height `min(92dvh, 760px)`, width = height × 9/16, 2 px ink border, rounded-2xl, 5 px hard shadow, ink header bar "🕹️ Clappy · Space to hop · Esc to close" with a ✕, dimmed backdrop; click outside or Esc closes. The mock (`mock/chat.html`, class `.cpop`) is the reference.
3. **Keyboard.** As built: the popup keeps focus *out* of the frame (a focused frame would swallow Escape), blurring it whenever it takes focus, and forwards `Space`/`ArrowUp` from the document as `fcc:press` with `preventDefault()` (stops the page scrolling), ignoring key repeats. So Esc, ✕, EXIT and clicking outside always close the popup. The game's own `window.focus()` calls in embed mode are harmless under this scheme.
4. **Scores.** At the end of every run the frame posts `fcc:score`. Signed-in members (Basic, Pro and Ultimate alike) get it saved: a higher score than their saved best updates their row on the **Clappy Scoreboard**. The popup shows a small toast: "⭐ New personal best · on the Clappy Scoreboard" or, for a new all-time record, "🏆 New FCC high score! billy is posting it on The Stage".
5. **The Stage.** When the all-time record falls, the site creates a Stage post **by billy** with a comment, for example: *"🎬 NEW CLAPPY HIGH SCORE! Steve just flew 42 takes on the set (rank: DIRECTOR). Think you can beat it? ▶ Play Clappy"*. The link opens the Clappy Scoreboard, which has a Play button that opens the popup.
6. **Clappy Scoreboard.** A page (suggest `/games/clappy`) listing members by best score: rank number, avatar, name, score, in-game rank (EXTRA … MOGUL), trophies, date; the viewer's row highlighted; top 50; a big **Play Clappy** button that opens the popup. Also reachable from billy's posts and (optionally) the chat Scoreboard view, which could show "You vs them" Clappy bests the way the mock does.
7. **Guests.** Anyone not signed in can open `/games/clappy` and play; their `fcc:score` isn't saved. After their first finished run the page shows a card over the frame: "Nice run! Sign up to get on the Clappy Scoreboard" with Sign up / Sign in buttons (and "Keep playing"). Their best is kept in the frame's localStorage, so the game still shows BEST for them.

## How the game page talks to the site

Frame URL:
```
${FCC_GAMES_URL}/games/clappy.html?embed=1&origin=<site origin>&best=<member's saved best, or 0>
```
`sandbox="allow-scripts allow-same-origin" allow="autoplay"` as for Pop & Clap. `best` seeds the game's BEST line and its NEW BEST logic from the server, so a member's best follows them between devices.

Messages the frame posts to the parent (`event.data.v === 1 && event.data.game === "clappy"`; check `event.origin === FCC_GAMES_URL`):

| `type` | When | Fields |
|---|---|---|
| `fcc:ready` | page loaded | `game` |
| `fcc:score` | a run ended (the clapper hit something or the floor) | `score` (int, can be 0), `trophies` (int), `rank` (string, e.g. `GAFFER`), `best` and `newBest` (the game's own view from localStorage + the `best` param; the site decides for itself from its saved row) |
| `fcc:close` | EXIT pressed inside the game | `game` — close the popup |

Messages the parent posts to the frame (`frame.contentWindow.postMessage(msg, FCC_GAMES_URL)`):

| `type` | When | Fields |
|---|---|---|
| `fcc:press` | Space/ArrowUp pressed on the page while the popup is open | `v: 1` — same as a tap |
| `fcc:best` | the saved best changed (e.g. the viewer signed in mid-session) | `v: 1`, `best` (int) |

The frame never navigates or opens windows; it only draws and posts. Scores are self-reported by a canvas game, so treat them like any client claim: validate (integer, 0–9999), rate-limit (one save per few seconds per member), and keep the leaderboard light-hearted. The protocol above is frozen like Pop & Clap's; changes are agreed with the site first.

## Website work, in order

1. **Prisma.** One row per member is the scoreboard:
   ```prisma
   model ClappyScore {
     userId    String   @id
     best      Int
     trophies  Int      @default(0)
     rank      String   @default("EXTRA")
     runs      Int      @default(0)
     updatedAt DateTime @updatedAt
     createdAt DateTime @default(now())
     @@index([best])
   }
   ```
   (Optional `ClappyRun` history if you want per-run stats later.)
2. **Server action** `submitClappyScore({ score, trophies, rank })` in `src/app/chat/actions.ts` or a new `src/lib/clappy.ts`: requires a session (guests get `{ ok: true, saved: false }`); validates; bumps `runs`; if `score > best` updates the row and returns `{ newBest: true, isRecord }` where `isRecord` means it beat the highest `best` of everyone else. If `isRecord`, create the Stage post (next point).
3. **billy's Stage post.** Needs a user to post as. If "billy" is an existing account (the FCC mascot/admin), post with a server-side helper as that user; otherwise seed a system user `billy` (display name "billy", FCC avatar, not listed in the Directory). Post body as in the experience section, with the link to `/games/clappy`. Post **only** when the all-time record falls (recommended, keeps The Stage from filling with 3-point runs); alternatives in the decisions below.
4. **Clappy Scoreboard page** `/games/clappy`: public (guests see the board and can play; the sign-up invite appears after a run), lists `ClappyScore` ordered by `best desc` with member names/avatars, Play button that opens the popup. This page is also the full-screen home for Clappy on phones.
5. **Popup component** `ClappyPopup.tsx` (client, portal to `document.body`): sizing/behaviour as above; builds the frame URL with the viewer's saved best; handles `fcc:score`/`fcc:close`; forwards Space; focuses the frame; toasts; guest invite card.
6. **Chat menu.** Add the 🕹️ Clappy entry under Play a game (all plans). It opens the popup instead of creating a `ChatGame`.
7. **Test.** Desktop: open from the chat, Space hops, Esc closes, a run posts a score and the scoreboard row updates; a bigger run makes billy post once. Phone: full screen, EXIT closes, scores save. Guest: play on `/games/clappy`, see the invite, nothing saved.

## Decisions (made by Steve, 29 Oct 2026)
- **billy posts only when the all-time record falls.** billy already exists on the site as a hidden stage-manager account; his record post follows his "approval first / live" setting.
- **The Clappy Scoreboard is a page at `/games/clappy`.**
- **Guests** can play and see scores and ranks; names and photos show only to signed-in members.
- The site side is being built by the FCC design session against the protocol above, unchanged.

## Later
- A "challenge" line in the chat: post your Clappy score to the member you're talking to ("Steve scored 42 in Clappy · beat it?") with a tap-to-play link.
- Weekly reset board alongside the all-time one.
