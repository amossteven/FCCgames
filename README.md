# FCC Games 🎬📺

**Live:** https://amossteven.github.io/FCCgames/ · **Repo:** https://github.com/amossteven/FCCgames

Turn-by-turn games themed around UK film and television, built to be played **inside a chat or messaging area**. No server, no accounts, no database: each game is a single HTML page and the *entire game state lives in the link*.

## How a turn works

1. A player opens a game, enters both names and makes the first move.
2. The page produces a short message — a one-line summary of the move plus a link — and a **Copy move** button.
3. The player pastes it into the FCC messaging area.
4. The opponent clicks the link, sees the last move replayed, plays their turn, and pastes *their* link back.

Example of what lands in the chat:

```
🃏 Telly Trumps — turn 4 · Trainspotting (97) vs Zulu (75) on Quotability — Steve takes the round!
👉 Jo, it's your turn: https://amossteven.github.io/FCCgames/games/telly-trumps.html#eyJwIjpbIlN0ZXZlIi...
```

Because the state is in the URL fragment (`#…`) nothing is ever sent to a server, links never expire, and the games work from GitHub Pages, any static host, or even a shared folder.

## The games

**Now:** one game, built for the chat first.

| Game | File | What it is |
|---|---|---|
| **Pop & Clap** 🎬🍿 | `games/pop-and-clap.html` | Connect Four at the pictures: clapperboards vs popcorn, plus one **Director's Cut** each (pull your own bottom piece and the column drops). Compact "board only" layout inside the chat card. |
| **Clappy** 🕹️🏆 | `games/clappy.html` | Solo 8-bit film set flyer: tap or press Space to hop the clapperboard past boom poles, lamps and camera cranes, grab trophies for power-ups, beat your best. Opens in a popup on the site and posts its score (`fcc:score`) for the Clappy Scoreboard and billy's Stage posts. |

**On the shelf** (kept in `games/`, not offered in the launcher or the chat menu for now):

| Game | File | Style | What it is |
|---|---|---|---|
| **Telly Trumps** 🃏 | `games/telly-trumps.html` | Card game | Top Trumps with 36 British films and TV shows. Six stats (Vintage, Cult Status, Laughs, Tears, Britishness, Quotability). Win all their cards or have the most after 40 rounds. |
| **Channel Hopper** 📺 | `games/channel-hopper.html` | Strategy / 8-bit | Battleships on a TV listings grid (6 channels × 8 half-hour slots). Hide five programmes, fire two "channel hops" a turn, take theirs off air. |
| **Spoiler Alert** 🤫 | `games/spoiler-alert.html` | Word game | Wordle duel. Each player hides a one-word British title (5–11 letters); first to crack the other's wins. You can see how close they're getting. |
| **Bank It!** 💷 | `games/bank-it.html` | Quiz | Push-your-luck trivia. Five questions a turn worth £20/£50/£100/£200/£500; bank the chain or risk it. 90-question UK film & TV bank, no repeats. First to £1,000. |

`index.html` is the launcher.

## Design

The games share one theme, matched to the Film Crew Collective website: cream background, near-black type, orange accent, Archivo Black headlines with Inter body copy, pill buttons, and rounded cards with black borders and hard offset shadows. Game boards (TV listings, Connect grid) sit on black panels in thick orange frames, echoing the site's framed imagery. All colours are CSS variables at the top of `shared/fcc.css`, so a brand tweak is a one-line change.

## Structure

```
index.html                 launcher
shared/fcc.css             FCC brand theme (colours, type, buttons, cards)
shared/fcc.js              play-by-message engine shared by every game (incl. embed mode)
games/*.html               one self-contained page per game
docs/                      chat-integration plan and embed demo
package.json, railway.json, serve.json   static hosting on Railway
```

### The engine (`shared/fcc.js`)

Each game calls `FCC.app({ id, title, emoji, blurb, howTo, newState, renderTurn, renderBoard })` and gets for free:

- state ↔ URL encoding (`#` fragment, base64url JSON)
- new-game form, turn banner, "last move" replay panel, copy/share panel, game-over panel with rematch
- seeded random (`FCC.rng`, `FCC.shuffle`) so both players see the same deal
- light obfuscation (`FCC.obf`) for secrets such as hidden boards and words
- tiny WebAudio sound effects with a mute toggle, confetti on a win
- a "you already sent this move" guard (per browser, via localStorage)

Adding a sixth game is ~150 lines: define `newState(players, seed)`, render the current player's turn, and call `api.commit({ by, text })` when the move is made.

## Inside the FCC website chat

The engine has an **embed mode** so the site can host a game in a frame with both members' names filled in and receive each move by `postMessage` instead of copy and paste. The protocol and the website work are in [docs/CHAT-INTEGRATION.md](docs/CHAT-INTEGRATION.md); [docs/embed-demo.html](docs/embed-demo.html) is a working parent page.

## Hosting

**Railway**

The repo includes `package.json` (serves the folder with `serve`), `railway.json` and `serve.json`. Add the repo as a Railway service and it deploys as-is. It needs **no variables**: Railway supplies `PORT`. Health check is `/health.txt`.


**GitHub Pages**

1. Create a repo, push this folder.
2. Settings → Pages → Deploy from branch → `main` / root.
3. The launcher is at `https://<user>.github.io/<repo>/`. Move links are generated from whatever URL the page is served at, so nothing needs configuring.

**Embedding in the FCC website**

- Simplest: link to the launcher from the site. Players paste move links into the existing messaging area; the links open the game in a new tab.
- Optional: embed a game in an `<iframe>` on a page of your site. The move links will then point at the hosted game page rather than the iframe host, which is fine, or you can serve the games from the same domain as the site so they open in place.
- If the FCC messaging platform auto-links URLs (most do), the pasted message is clickable as-is.

## Fair-play notes

- There's no authentication; whoever opens the link plays the turn. This is a members' club, not a casino.
- Hidden information (Channel Hopper boards, Spoiler Alert words) is obfuscated in the link, not encrypted. Someone determined could decode it. House rule: don't.
- Bank It! answers are in the page source, as they must be for a static site. Same house rule.

## Content

- Years in Telly Trumps are real; the other five stats are deliberately arguable club ratings, so argue.
- The trivia questions were written for this project. If you spot a wrong answer, it's in the `Q` array at the top of `games/bank-it.html` as `[question, correct, wrong, wrong, wrong]`.

## Licence

Code: MIT. Film and programme titles are referenced for commentary and play only; no copyrighted artwork or dialogue is included.
