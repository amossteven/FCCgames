# Putting FCC Games inside the members' chat

How the five games plug into the Film Crew Collective website's conversations, using the same
Gamepad button that already offers Overtime, with the FCC games listed above the Overtime entries.

## Where things stand (25 Oct 2026, evening)

| Piece | Status |
|---|---|
| Five games, FCC-styled, playable by pasted link | **Done.** Live at https://amossteven.github.io/FCCgames/ |
| Games as their own Railway service | **Config done** (`package.json`, `railway.json`, `serve.json`). Needs no variables; Railway supplies `PORT`. |
| Embed mode: site hosts a game in a frame, names pre-filled, moves sent back, new state pushed in live | **Done** in `shared/fcc.js`. Reference parent page: `docs/embed-demo.html` |
| Website side (menu entry, game page, message button, database) | **To build** in the FCC repo. Roughly a day of focused work. |

## The experience we're building

Members play **inside the conversation**. Nobody leaves the chat and no links are sent.

1. In a conversation, Steve taps the Gamepad button beside the message box. The menu reads:
   **Play a game** — 🃏 Telly Trumps · 📺 Channel Hopper · 🎞️ Clapperboard Connect · 🤫 Spoiler Alert · 💷 Bank It!
   **Invite to Overtime** — Duel · Co-op (unchanged)
2. Picking Telly Trumps puts a **game card** in the conversation: the game itself, live, with both names already filled in (Steve, and the member he's talking to). While a game is in progress the card is **pinned at the top of the thread**, above the messages, so it's always in view. Steve makes his first move right there.
3. Jo gets a **turn nudge**: the conversation shows as unread with a thin pin line in the thread, *"🃏 Steve played · your move"*, the Messages badge in the nav lights up, and she gets the usual message email if she isn't on the site (the same once-per-unread-run rule as messages, so a long game doesn't become a long email thread). There is no link; she opens the conversation and the pinned card shows Steve's move with her turn ready to play.
4. Both of them can leave the conversation open: the thread's existing poll notices when the other player has moved and the card updates in place (the game gets the new state pushed into it; no reload, no flicker).
5. When the game ends the card shows the result with a Rematch button, then unpins; a result line stays in the history (*"🏆 Jo won Telly Trumps 12–0"*). Rematch starts a new card with the loser going first.

The site knows who is who, so only the player whose turn it is can move, and the other player sees a "Waiting for Steve" screen on the same card.

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

The state is opaque to the site. The only thing the site reads from it is `state.n` (the seat whose turn it is) to verify a move came from the right member.

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

### 6. Pinning and multiple games
- One active game per conversation keeps the pinned area to a single card. If you'd rather allow several, pin only the most recent and list the others in a small tab strip on the card.
- The pin is simply "render the active game above the list"; nothing to store.

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
