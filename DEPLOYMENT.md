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
- **Problem**: Inconsistent build script names
- **Fix**: Updated `package.json` scripts (`build:bot` + `build:webapp`)
- **Result**: Both backend and frontend build successfully

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
### Prometheus on Fly
Add to `fly.toml`:
```toml
[[services]]
  internal_port = 9000
  protocol = "tcp"
  [[services.ports]]
    port = 9000
    handlers = ["http"]
```

