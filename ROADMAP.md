# SPRESS Roadmap: From Works to Wow

The following tasks are ordered for sequential rollout. Each block is deployable on its own.

- **Ship a Docker + Fly.io/Render deploy**
  - `Dockerfile` uses `node:20-alpine`, copies src, runs `npm ci && npm run build`, exposes process env `BOT_TOKEN`, `DATABASE_URL`.
  - `fly.toml` or `render.yaml` sets secrets and persistent volume for SQLite.
  - `npm run migrate && node dist/server.js` as the `CMD`.

- **Single-process concurrency lock**
  - In `src/store/games.ts` wrap all `UPDATE games…` in `db.transaction()` to prevent split-turn race when two moves arrive within the same tick.
  - Use `wsHub.ts` channel lock:

    ```ts
    const lock = new Map<string,Promise<void>>();
    async function withLock(id: string, fn: () => Promise<void>) {
      const p = (lock.get(id) ?? Promise.resolve()).then(fn).finally(()=> lock.delete(id));
      lock.set(id,p); return p;
    }
    ```

- **Emoji (or PNG) board render in-chat**
  - Add `chess-image-generator` (png) or custom emoji grid → returns `Buffer`.
  - Replace ASCII on `show_board_` with `ctx.replyWithPhoto({ source: buffer }, { caption: 'Current position' })`.
  - Cache last rendered FEN to skip duplicate renders.

- **Game history + PGN download**
  - `games` table already stores `pgn`.  `/pgn <sessionId | last>` sends a `.pgn` file via `replyWithDocument`.
  - `/history` lists last 5 finished games with inline “PGN” buttons.

- **Elo-style rating & leaderboard v1**
  - On each PVP result:

    ```ts
    const k = 32;
    const exp = 1/(1+10^((rb-ra)/400));
    ra += k*(scoreA-exp); rb += k*((1-scoreA)-(1-exp));
    ```
  - Store `rating` in `stats`.  Seed new users at 1000.
  - `/leaderboard` shows top 10 by rating in the current group.

- **Spectator & replay**
  - Inline button “👀 Watch” posts the live web-app link in group for non-players; param `spectator=1`.
  - After game end, “▶️ Replay” opens board in review mode stepping through PGN.

- **Internationalisation scaffold**
  - Wrap all user-visible strings in `t('key', lang)`; detect `ctx.from.language_code` defaulting to `en`.
  - Provide `en.json`, `es.json` to start.

- **Observability**
  - Replace `console` with `pino`; pipe to `pino-pretty` locally, to `stdout` in prod.
  - Expose `/metrics` Prometheus endpoint: total games, active games, commands/sec, WS latency.
  - Add Grafana dashboard.

- **Hardening & limits**
  - Flood-control middleware: max 5 commands / 10 s per user, else `429` reply.
  - Validate every callback_data with `ctx.answerCbQuery('❌ stale')` if game not found.
  - Nightly cron: `DELETE FROM games WHERE winner IS NOT NULL AND updatedAt < now-30d; VACUUM`.

- **Growth hook**
  - “Share your win” button after each victory: auto-fills group link or DM with a brag message + board image.

After **emoji boards** and **Elo ratings** are live, announce to the testing group and solicit feedback before enabling spectator mode for all chats.

