# Putting FCC Games inside the members' chat

How the five games plug into the Film Crew Collective website's conversations, using the same
Gamepad button that already offers Overtime, with the FCC games listed above the Overtime entries.

## Where things stand (25 Oct 2026)

| Piece | Status |
|---|---|
| Five games, FCC-styled, playable by pasted link | **Done.** Live at https://amossteven.github.io/FCCgames/ |
| Games as their own Railway service | **Config done** (`package.json`, `railway.json`, `serve.json`). Needs no variables; Railway supplies `PORT`. |
| Embed mode: site hosts a game in a frame, names pre-filled, moves sent back automatically | **Done** in `shared/fcc.js`. Reference parent page: `docs/embed-demo.html` |
| Website side (menu entry, game page, message button, database) | **To build** in the FCC repo. Roughly a day of focused work. |

## The experience we're building

1. In a conversation, Steve taps the Gamepad button beside the message box. The menu now reads:
   **Play a game** — 🃏 Telly Trumps · 📺 Channel Hopper · 🎞️ Clapperboard Connect · 🤫 Spoiler Alert · 💷 Bank It!
   **Invite to Overtime** — Duel · Co-op (unchanged)
2. Picking Telly Trumps posts a message to the conversation, *"🃏 Telly Trumps — Steve has started a game. Your move next!"*, and opens Steve's game page in a new tab (same open-tab-first pattern as Overtime). Names are already filled in: Steve and the member he's talking to. He makes his first move; the page shows "Move sent".
3. Jo sees the message in the chat with a **▶ Your move** button. She taps it, the game opens showing Steve's move, she plays, and a message goes back: *"🃏 Telly Trumps — move 2 · Trainspotting (97) vs Zulu (75) on Quotability — Jo takes the round!"* with Steve's **▶ Your move** button.
4. When the game ends the message says who won, and a **🏆 See result** button shows the final board with a Rematch option.

Nobody copies or pastes anything. The site knows who is who, so only the player whose turn it is can move.

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

The state is opaque to the site. The only thing the site reads from it is `state.n` (the seat whose turn it is) to verify a move came from the right member.

## Website work, in order

### 1. Settings
- `FCC_GAMES_URL` — the games service address (Railway or a custom domain such as `games.filmcrewcollective.co.uk`). Add to `.env.example` next to `OVERTIME_URL` and to the site's Railway variables. The games service itself needs no variables.
- Plan gating: a `fcc_games` feature in `planFeatureDefaults.ts`. Suggest `{ basic: true, pro: true, ultimate: true }` — these games are light and a good reason for free members to open the chat.
- Once the site's domain is final, add a `Content-Security-Policy: frame-ancestors` header for it in the games repo's `serve.json`, so nobody else can frame the games.

### 2. Database (Prisma)
```prisma
model ChatGame {
  id             String    @id            // short code, e.g. 8 chars from the room-code alphabet
  game           String                   // "trumps" | "hopper" | "connect" | "spoiler" | "bankit"
  conversationId String
  playerAId      String                   // seat 0, started the game, moves first
  playerBId      String                   // seat 1
  state          Json?                    // null until the first move
  turn           Int       @default(0)
  nextPlayerId   String?                  // null when finished
  winnerId       String?                  // null for a draw or unfinished
  finishedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([conversationId])
  @@index([nextPlayerId])
}
```

### 3. `src/lib/fccGames.ts` (server only), modelled on `overtimeInvite.ts`
- `FCC_GAMES` catalogue: `{ id, file, title, emoji, blurb }` for the five games.
- `startChatGame(me, conversationId, gameId)` — checks the conversation is mine, the feature is on for both members, the invite rate limit (reuse `overtime:invite`), creates the `ChatGame` row with `state: null`, posts the start message with the link `/members/games/<id>`, returns `{ ok, hostPath: "/members/games/<id>" }`.
- `submitChatMove(me, id, payload)` — loads the row; rejects if I'm not a player, the game is finished, or it isn't my seat's turn (`state === null` → seat 0, else `state.n`); checks `payload.state` is an object under 8 KB and `payload.text` under 300 chars; saves `state`, `turn`, `nextPlayerId`, `winnerId`, `finishedAt`; posts the move (or result) message. Moves are ordinary messages, so plan rules, rate limits and notifications already apply.
- `chatGameFor(me, id)` — what the game page needs: names, my seat, state, whether it's my turn.

### 4. Server actions in `src/app/chat/actions.ts`
`startFccGame(conversationId, gameId)` and `submitFccMove(id, payload)`, thin wrappers like `inviteToOvertime`.

### 5. Chat UI
- **Menu**: extend `OvertimeInviteMenu.tsx` into a game menu with two sections. The FCC games sit above the Overtime Duel/Co-op entries (same row style: emoji, title, one-line blurb). Picking one uses the existing open-tab-first pattern and points the tab at `hostPath`. `thread.canInviteToOvertime` keeps gating the Overtime section; a new `thread.canPlayFccGames` gates the games section.
- **Message button**: in `messageText.ts` add `FCC_GAME_LINK_PATTERN = /\/members\/games\/[A-Za-z0-9]{6,12}(?![A-Za-z0-9])/` to `splitMessageLinks` as `fccGameLink`, and render an `FccGameButton` in `ChatThreadView.tsx` and both Messages pages next to the existing `GameLinkButton`. Label: **▶ Your move** when the game's `nextPlayerId` is me, **👀 View game** when it's theirs, **🏆 See result** when finished. The button can read that from the message text at first (the move text says whose move is next), and ask the server like `GameLinkButton` does once there's a lobby.

### 6. The game page `src/app/members/(app)/(account)/games/[id]/page.tsx`
- Server component: loads the game via `chatGameFor`, builds the iframe URL above with `senderDisplayName` for the names, my seat, and the saved state (or `new=1`).
- Client component `FccGameFrame`: renders the iframe, listens for `message` events from `FCC_GAMES_URL` only, calls `submitFccMove` on `fcc:move`, sets the height on `fcc:height`, calls `startFccGame` on `fcc:rematch`. After a move it shows "Move sent" and a **Back to the chat** link to the conversation.
- `docs/embed-demo.html` in the games repo is a working parent page to copy from.

### 7. Test and ship
Two accounts, one conversation: start each of the five games, play a full game of Clapperboard Connect (quickest), check both Messages pages and the chat window render the buttons, check the "Waiting for…" screen when it isn't your turn, check a finished game's result button.

## Decisions for Steve
- **Notifications**: each move is a message, so members get the usual email/push for it. A game is 10–15 messages. Options: leave as is; add a `notifyGames` preference like `notifyOvertime`; or only notify on the first move and the result.
- **Who can play**: all plans (suggested) or Pro and above like Overtime multiplayer.
- **Domain**: keep the Railway address or add `games.` on the FCC domain (nicer in links, and needed for the frame-ancestors header).

## Later
- `/members/games` lobby: games where it's your move, recent results, a leaderboard per game.
- "Your move" count on the Gamepad icon or the Messages nav item.
- More games on the same engine (each is a single HTML file; the site needs only a catalogue entry).
