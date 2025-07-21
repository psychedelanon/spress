# Railway Deployment Guide

## Environment Variables Required

Set these in your Railway project's environment variables:

```env
NODE_ENV=production
PUBLIC_URL=https://your-app-name.railway.app
TELE_TOKEN=your_telegram_bot_token
```

### Important Notes:

1. **PUBLIC_URL**: Must be set to your actual Railway app URL so the Telegram bot generates correct webapp links
2. **TELE_TOKEN**: Your bot token from @BotFather
3. **NODE_ENV**: Should be "production" (usually set automatically by Railway)

## Quick Node Deployment

1. **Create a project** on Railway and link this repository.
2. **Set environment variables** as shown above, particularly `TELE_TOKEN` and
   `PUBLIC_URL` (use your Railway URL).
3. **Build Command** (if you override the default):
   ```bash
   npm install && cd webapp && npm install && npm run build && cd ..
   ```
4. **Start Command**:
   ```bash
   npm start
   ```
5. Run `railway up` or deploy via the dashboard. Railway will install
   dependencies, build the app, and launch `node start.js` automatically.

No Docker setup is required—Railway runs the Node.js server directly.

## Fixed Deployment Issues

### ✅ 1. Backend TypeScript Compilation
- **Problem**: `.railwayignore` was excluding `src/` directory
- **Fix**: Removed `src/` and `webapp/src/` from `.railwayignore`
- **Result**: Railway now receives TypeScript source files for compilation

### ✅ 2. Frontend Static Assets
- **Problem**: Missing base path configuration
- **Fix**: Using `import.meta.env.BASE_URL` for piece images
- **Result**: Assets load correctly at `/webapp/pieces/*.svg`

### ✅ 3. WebSocket Handler Conflicts
- **Problem**: Direct `onmessage=` assignments overwriting handlers
- **Fix**: Converted to `addEventListener` with proper cleanup
- **Result**: Multiple components can listen without conflicts

### ✅ 4. Build Process
- **Problem**: Inconsistent build script names and missing backend compilation
- **Fix**: `build:bot` now runs `tsc` and `build:webapp` builds the React app
- **Result**: Both backend and frontend build successfully on Railway

## Build Verification

Local test:
```bash
npm run build  # Should succeed
node dist/server.js  # Should start without errors
```

Railway will run:
1. `npm ci` (install dependencies)
2. `cd webapp && npm ci` (install frontend dependencies)  
3. `npm run build` (compile TypeScript + build React app)
4. `node dist/server.js` (start server)

## File Structure After Build

```
dist/                  # Backend compiled files
├── server.js
├── wsHub.js
└── ...

webapp/dist/           # Frontend build output
├── index.html
├── assets/
└── pieces/            # Chess piece SVGs
    ├── wK.svg
    ├── bQ.svg
    └── ...
```

## Static File Serving

In production, Express serves:
- Frontend: `https://your-app.railway.app/webapp/`
- Pieces: `https://your-app.railway.app/webapp/pieces/*.svg`
- WebSocket: `wss://your-app.railway.app/ws`

The Telegram bot generates links like:`https://your-app.railway.app/webapp/?session=123&color=w`

### Fly.io Services
Add to `fly.toml`:
```toml
[[services]]
  internal_port = 3000
  protocol = "tcp"
  [[services.ports]]
    port = 80
    handlers = ["http"]
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[[services]]
  internal_port = 9000
  protocol = "tcp"
  [[services.ports]]
    port = 9000
    handlers = ["http"]
```

