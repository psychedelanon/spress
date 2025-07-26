# SPRESS Chess Mini App

A full-featured chess mini-app for Telegram with real-time gameplay, AI opponents, and touch-friendly controls.

## ✨ Features

### 🎮 Game Modes
- **Solo vs AI**: Play against an intelligent AI opponent with tactical evaluation
- **PvP**: Challenge friends via Telegram with real-time synchronization
- **Real-time Updates**: Powered by Pusher channels for instant move synchronization

### 🎨 Enhanced UI
- **Blue & Yellow Theme**: Distinctive board colors (#0053FF dark squares, #FFD700 light squares)
- **Red Border**: Bold #E01313 border around the chessboard
- **Touch Interactions**: 
  - Tap-to-select pieces and highlight legal moves
  - Drag-and-drop support for desktop users
  - Haptic feedback on supported devices
- **Mobile Optimized**: Responsive design for all screen sizes

### 🤖 Smart AI
- Strategic piece evaluation with position tables
- Minimax search with alpha-beta pruning
- Opening book for strong early game
- Tactical awareness (checks, mobility, piece values)

### 📱 Telegram Integration
- Launch via bot commands (`/solo`, `/new @username`)
- Web App buttons for seamless board access
- Turn notifications when opponent is offline
- Game state persistence across sessions

## 🚀 Quick Start

### Development
```bash
# Install dependencies
npm install
cd webapp && npm install

# Start development servers
npm run dev
```

### Lint & Test
```bash
npm run lint
npm test
```

### Production Build
```bash
# Build both backend and webapp
npm run build

# Start production server (auto-builds webapp if missing)
npm start
```

If you encounter a `createContext` error after building, clean the frontend and reinstall:
```bash
npm run clean:webapp
npm run build
```

### Deployment (Fly.io)
Deploy the bot to [Fly.io](https://fly.io/) using the included `fly.toml`.

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and run
   `flyctl launch` to create a new app.
2. Set the required secrets:
   ```bash
   flyctl secrets set TELE_TOKEN=your_bot_token \
     PUBLIC_URL=https://your-app.fly.dev
   ```
3. Deploy with:
   ```bash
   flyctl deploy
   ```
4. The bot will be available at your Fly domain
   (e.g., `https://your-app.fly.dev`).

This workflow uses Fly's Docker build system.

### Deployment (Vercel)
The project can also be hosted on [Vercel](https://vercel.com/). Vercel now auto-detects the Node API functions and the `webapp` build output, so no `vercel.json` file is required.

1. Install the [Vercel CLI](https://vercel.com/docs/cli) and run `vercel link` in this folder.
2. Configure the following environment variables in the Vercel dashboard or via `vercel env add`:
   - `TELE_TOKEN`
   - `PUBLIC_URL` (should match your Vercel URL)
   - `PUSHER_APP_ID`
   - `PUSHER_KEY`
   - `PUSHER_SECRET`
   - `PUSHER_CLUSTER`
   - `VITE_PUSHER_KEY`
   - `VITE_PUSHER_CLUSTER`
3. Deploy with:
   ```bash
   vercel --prod
   ```
4. Your mini app will be available at the Vercel domain shown after deployment.

## 🎯 Game Commands

### Telegram Bot Commands
- `/start` - Welcome message and instructions  
- `/solo` - Start a game against AI
- `/new @username` - Challenge another player
- `/resign` - Resign from current game
- `/help` - Show command help

### In-Game Controls
- **Touch/Click**: Tap a piece to select, tap destination to move
- **Drag & Drop**: Drag pieces to move (desktop friendly)
- **Visual Feedback**: Selected pieces and legal moves are highlighted

## 🛠 Technical Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express with Pusher for realtime
- **Chess Engine**: chess.js with custom AI evaluation
- **UI**: react-chessboard with custom theming
- **Deployment**: Fly.io using Docker
- **Telegram**: Telegraf bot framework

## 🎨 Theme Colors

- **Board Light Squares**: `#FFD700` (Gold)
- **Board Dark Squares**: `#0053FF` (Blue)  
- **Board Border**: `#E01313` (Red)
- **Title Text**: `#FFD700` (Gold)
- **Background**: `#00102E` (Dark Blue)

## 🔧 Configuration

### Environment Variables
```bash
TELE_TOKEN=your_telegram_bot_token
PUBLIC_URL=your_deployment_url
NODE_ENV=production
PORT=3000
WEBAPP_URL=https://yourapp.com/webapp
METRICS_PORT=9000
ENABLE_SHARE_HOOK=0
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster
VITE_PUSHER_KEY=your_pusher_key
VITE_PUSHER_CLUSTER=your_pusher_cluster
```

`PUBLIC_URL` **must** match the public domain of your deployment (for example
`https://mychess.fly.dev`). The server listens on `PORT` (3000 by default), so
your hosting provider needs to route traffic to this port.

On Fly.io, add the following services to `fly.toml`:
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


### Persistent Storage
When `/data` exists, the server stores games in a SQLite database at
`/data/games.db`. Mount this path as a volume so games persist after container
restarts. Example `docker-compose.yml`:

```yaml
services:
  spress:
    volumes:
      - spress_data:/data

volumes:
  spress_data:
```

For `docker run`, append `-v spress_data:/data`.

### Optional: Board Image Support
Install the [`chess-image-generator`](https://www.npmjs.com/package/chess-image-generator) package if
you want inline "Show Board" buttons to reply with PNG chessboards. Without it the bot falls back to
an ASCII board.

### Bot Setup
1. Create a bot with @BotFather on Telegram
2. Set bot commands via BotFather:
   ```
   start - Welcome message
   solo - Play vs AI
   new - Challenge a friend  
   resign - Resign current game
   help - Show help
   ```
3. Configure webhook URL (optional): `https://yourapp.com/bot`

## 📱 Mini App Integration

The chess board opens as a Telegram Web App with:
- Full-screen immersive experience
- Touch-optimized controls
- Real-time game state synchronization
- Telegram theme integration
- Haptic feedback support

When opened without a `session` parameter, the webapp now automatically
retrieves the user's active game. It calls the `/api/session` endpoint,
which returns the last active session ID stored for that Telegram user.
The bot records this mapping whenever a new game is created.

### Troubleshooting Telegram Mini Apps

- **Blank screen on Android** – ensure your server provides the **full SSL
  certificate chain**. Serving only the leaf certificate can cause Telegram’s
  Android webview to block the request entirely.
- **Stuck loading** – some Telegram versions (for example v10.2.2 on Android)
  had bugs preventing mini apps from launching. Updating the Telegram client
  typically resolves this.
- **`createContext` errors** – if the built webapp fails with
  `Uncaught TypeError: Cannot read properties of undefined (reading 'createContext')`,
  delete the `webapp/node_modules` and `webapp/dist` folders and reinstall
  dependencies:
  ```bash
  rm -rf webapp/node_modules webapp/dist
  npm --prefix webapp install
  npm run build
  ```

## 🎯 Future Enhancements

- [ ] Custom piece graphics
- [ ] Move history display
- [ ] Game analysis and hints
- [ ] Multiple difficulty levels
- [ ] Tournament brackets
- [ ] Player statistics
- [ ] Persistent database (SQLite)

---

Built with ♟️ for the Telegram Mini Apps ecosystem.

