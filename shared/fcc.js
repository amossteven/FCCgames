/* FCC Games — shared play-by-message engine
 * Every game state lives in the URL hash. A move = a new link + a one-line summary.
 * Players paste the message into the FCC chat; the opponent opens the link to play.
 */
(function () {
  const FCC = {};

  /* ---------- encoding ---------- */
  const B64 = {
    enc(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = '';
      bytes.forEach(b => (bin += String.fromCharCode(b)));
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(s) {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      const bin = atob(s);
      return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    }
  };
  FCC.encode = state => B64.enc(JSON.stringify(state));
  FCC.decode = str => { try { return JSON.parse(B64.dec(str)); } catch (e) { return null; } };
  FCC.loadState = () => { const h = location.hash.slice(1); return h ? FCC.decode(h) : null; };
  FCC.baseUrl = () => location.href.split('#')[0];
  FCC.link = state => FCC.baseUrl() + '#' + FCC.encode(state);
  FCC.setHash = state => history.replaceState(null, '', '#' + FCC.encode(state));

  /* light obfuscation so secrets (boards, words) aren't readable in the link at a glance */
  FCC.obf = (str, key) => {
    const k = String(key); let out = '';
    for (let i = 0; i < str.length; i++) out += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return B64.enc(out);
  };
  FCC.deobf = (s, key) => {
    const k = String(key); const str = B64.dec(s); let out = '';
    for (let i = 0; i < str.length; i++) out += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return out;
  };

  /* ---------- randomness (seeded so both players see the same deal) ---------- */
  FCC.rng = seed => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  FCC.seed = () => (Math.random() * 0xFFFFFFFF) >>> 0;
  FCC.shuffle = (arr, rand) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  FCC.gameId = () => Math.random().toString(36).slice(2, 8);

  /* ---------- sound ---------- */
  let ctx = null;
  FCC.muted = localStorage.getItem('fcc-muted') === '1';
  FCC.beep = (freq = 440, dur = 0.08, type = 'square', vol = 0.05) => {
    if (FCC.muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(ctx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.stop(ctx.currentTime + dur);
    } catch (e) { /* no audio */ }
  };
  FCC.sfx = {
    click: () => FCC.beep(660, 0.05),
    tick: () => FCC.beep(880, 0.03, 'square', 0.03),
    good: () => { FCC.beep(523, 0.08); setTimeout(() => FCC.beep(784, 0.14), 90); },
    bad: () => FCC.beep(180, 0.25, 'sawtooth', 0.06),
    drop: () => { FCC.beep(300, 0.05); setTimeout(() => FCC.beep(200, 0.08), 50); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => FCC.beep(f, 0.16), i * 120)),
    lose: () => [400, 350, 300, 200].forEach((f, i) => setTimeout(() => FCC.beep(f, 0.2, 'sawtooth'), i * 150))
  };

  /* ---------- DOM helpers ---------- */
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  };
  FCC.h = h;
  FCC.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  FCC.copy = async text => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text);
      document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { }
      ta.remove(); return ok;
    }
  };
  FCC.confetti = (n = 80) => {
    const colors = ['#E8632B', '#1B1B1B', '#F2B544', '#2E9E6B', '#FBF9F6'];
    for (let i = 0; i < n; i++) {
      const c = h('div', { class: 'confetti', style: { left: Math.random() * 100 + 'vw', background: colors[i % colors.length], animationDuration: (2 + Math.random() * 2) + 's', animationDelay: (Math.random() * .8) + 's' } });
      document.body.append(c); setTimeout(() => c.remove(), 5000);
    }
  };
  FCC.badge = (state, i) => h('span', { class: 'badge p' + i }, state.p[i]);

  /* ---------- shared UI ---------- */
  function header(cfg) {
    const root = document.getElementById('fcc-header');
    if (!root) return;
    const mute = h('button', { class: 'btn sm ghost', title: 'Toggle sound', onClick: () => { FCC.muted = !FCC.muted; localStorage.setItem('fcc-muted', FCC.muted ? '1' : '0'); mute.textContent = FCC.muted ? '🔇' : '🔊'; if (!FCC.muted) FCC.sfx.click(); } }, FCC.muted ? '🔇' : '🔊');
    root.append(h('div', { class: 'bar' },
      h('a', { class: 'back', href: '../index.html' }, '◀ FCC GAMES'),
      h('div', { class: 'title' }, h('span', { style: { marginRight: '10px' } }, cfg.emoji), cfg.title),
      mute));
  }

  function howTo(cfg) {
    if (!cfg.howTo) return document.createDocumentFragment();
    return h('details', { class: 'panel howto' }, h('summary', {}, h('span', { style: { marginRight: '8px' } }, '📺'), 'How to play'), h('div', { html: cfg.howTo }));
  }

  function turnBanner(state) {
    return h('div', { class: 'banner' },
      h('div', { class: 'vs' }, FCC.badge(state, 0), ' vs ', FCC.badge(state, 1)),
      state.over ? h('div', { class: 'turn' }, 'GAME OVER') : h('div', { class: 'turn' }, `TURN ${state.t + 1} · `, h('span', { class: 'blink' }, '▶'), ` ${state.p[state.n]} to play`));
  }

  function newGamePanel(cfg, onStart) {
    const you = h('input', { type: 'text', maxlength: 18, placeholder: 'e.g. Steve', value: localStorage.getItem('fcc-name') || '' });
    const opp = h('input', { type: 'text', maxlength: 18, placeholder: 'e.g. Jo' });
    const start = () => {
      const a = you.value.trim() || 'Player 1', b = opp.value.trim() || 'Player 2';
      localStorage.setItem('fcc-name', a); FCC.sfx.good(); onStart([a, b]);
    };
    opp.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
    return h('div', {},
      h('div', { class: 'panel accent' },
        h('h2', {}, 'New game'),
        cfg.blurb ? h('p', { class: 'muted' }, cfg.blurb) : null,
        h('div', { class: 'field' }, h('label', {}, 'Your name'), you),
        h('div', { class: 'field' }, h('label', {}, "Opponent's name"), opp),
        h('button', { class: 'btn primary', onClick: start }, '▶ START — you go first')),
      howTo(cfg),
      h('div', { class: 'panel small muted' }, h('b', {}, 'How turns work: '), 'after each move you get a short message with a link. Paste it into the FCC chat. Your opponent opens the link, plays their turn, and pastes their link back. No accounts, no sign-ups.'));
  }

  function message(cfg, state) {
    const url = FCC.link(state);
    const last = state.last && state.last.text ? state.last.text : 'New game!';
    if (state.over) {
      const w = state.over.winner;
      const head = w == null ? `It's a DRAW!` : `${state.p[w]} WINS!`;
      return `${cfg.emoji} ${cfg.title} — GAME OVER · ${head}\n${last}\nSee the final result: ${url}`;
    }
    return `${cfg.emoji} ${cfg.title} — move ${state.t} · ${last}\n👉 ${state.p[state.n]}, it's your turn: ${url}`;
  }

  function sharePanel(cfg, state, justMoved) {
    const msg = message(cfg, state);
    const box = h('div', { class: 'msgbox' }, msg);
    const btn = h('button', { class: 'btn green', onClick: async () => { const ok = await FCC.copy(msg); FCC.sfx.good(); btn.textContent = ok ? '✓ COPIED — paste it in the FCC chat' : 'Copy failed — select the text above'; } }, '📋 COPY MOVE TO CLIPBOARD');
    const share = navigator.share ? h('button', { class: 'btn blue', onClick: () => navigator.share({ text: msg }).catch(() => { }) }, '📤 SHARE…') : null;
    return h('div', { class: 'panel good' },
      h('h2', {}, justMoved ? '✅ Move locked in!' : '⏳ You already made this move'),
      h('p', {}, `Send this to `, h('b', {}, state.p[state.n]), `. When they open the link they'll see your move and take their turn.`),
      box,
      h('div', { class: 'row', style: { marginTop: '12px' } }, btn, share));
  }

  function overPanel(cfg, state) {
    const w = state.over.winner;
    const msg = message(cfg, state);
    const btn = h('button', { class: 'btn green', onClick: async () => { const ok = await FCC.copy(msg); btn.textContent = ok ? '✓ COPIED' : 'Copy failed'; } }, '📋 COPY RESULT');
    const rematch = h('a', { class: 'btn yellow', href: FCC.baseUrl() + '#' + FCC.encode(cfg.newState([state.p[1], state.p[0]], FCC.seed(), cfg)), onClick: () => setTimeout(() => location.reload(), 10) }, '🔁 REMATCH (loser starts)');
    return h('div', { class: 'panel accent center' },
      h('h1', {}, w == null ? '🤝 DRAW!' : `🏆 ${state.p[w]} WINS!`),
      state.over.reason ? h('p', {}, state.over.reason) : null,
      h('div', { class: 'msgbox', style: { textAlign: 'left' } }, msg),
      h('div', { class: 'row', style: { marginTop: '12px', justifyContent: 'center' } }, btn, rematch, h('a', { class: 'btn ghost', href: FCC.baseUrl() }, '✨ NEW GAME')));
  }

  function replayPanel(state) {
    if (!state.last) return document.createDocumentFragment();
    return h('div', { class: 'replay' }, h('div', { class: 'who' }, `LAST MOVE · ${state.p[state.last.by]}`), h('div', {}, state.last.text));
  }
  FCC.replayPanel = replayPanel;

  /* ---------- app loop ----------
   * cfg = { id, title, emoji, blurb, howTo, newState(players, seed, cfg), renderTurn(state, api, root), renderBoard?(state) }
   */
  FCC.app = function (cfg) {
    const root = document.getElementById('app');
    header(cfg);
    let state = FCC.loadState();
    const api = {
      get state() { return state; },
      commit(last) {
        state.t = (state.t || 0) + 1;
        state.last = last;
        FCC.setHash(state);
        localStorage.setItem('fcc-sent-' + state.id, FCC.encode(state));
        if (state.over) {
          if (state.over.winner === last.by) { FCC.sfx.win(); FCC.confetti(); } else if (state.over.winner == null) FCC.sfx.good(); else FCC.sfx.lose();
        }
        render(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      rerender() { render(false); }
    };
    function render(justMoved) {
      root.innerHTML = '';
      if (!state) {
        root.append(newGamePanel(cfg, players => {
          state = cfg.newState(players, FCC.seed(), cfg);
          state.g = cfg.id; state.id = FCC.gameId(); state.t = 0; state.n = state.n || 0;
          FCC.setHash(state); render(false);
        }));
        return;
      }
      if (state.g !== cfg.id) {
        root.append(h('div', { class: 'panel warn' }, h('h2', {}, 'Wrong game link'), h('p', {}, 'This link is for a different game. ', h('a', { href: '../index.html' }, 'Back to all games'))));
        return;
      }
      root.append(turnBanner(state));
      if (state.over) {
        if (cfg.renderBoard) root.append(cfg.renderBoard(state));
        root.append(overPanel(cfg, state));
        if (!justMoved && state.over.winner != null && state.over.winner !== state.last.by) { /* opener is the winner */ FCC.confetti(); }
        return;
      }
      const sent = localStorage.getItem('fcc-sent-' + state.id) === FCC.encode(state);
      if (justMoved || sent) {
        root.append(sharePanel(cfg, state, justMoved));
        if (cfg.renderBoard) root.append(cfg.renderBoard(state));
        root.append(howTo(cfg));
        return;
      }
      cfg.renderTurn(state, api, root);
      root.append(howTo(cfg));
    }
    render(false);
    window.addEventListener('hashchange', () => { state = FCC.loadState(); render(false); });
  };

  window.FCC = FCC;
})();
