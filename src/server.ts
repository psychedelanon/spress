import express from 'express';
import { Telegraf } from 'telegraf';
import WebSocket, { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import http from 'http';
import { URL } from 'url';
import path from 'node:path';

dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialize Telegram bot
console.log('🔧 Initializing bot...');
if (!process.env.TELE_TOKEN) {
  throw new Error('TELE_TOKEN is required');
}
const bot = new Telegraf(process.env.TELE_TOKEN);
console.log('✅ Bot instance created');

// WebSocket server for real-time board updates
const wss = new WebSocketServer({ server });

// Store WebSocket clients by session ID
const sessions = new Map<string, Set<WebSocket>>();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve webapp static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(
    '/webapp',
    express.static(path.join(__dirname, '../webapp/dist'), { maxAge: '1h' })
  );
  app.get('/webapp/*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../webapp/dist/index.html'));
  });
} else {
  // In development, just serve a simple message
  app.get('/webapp/*', (_req, res) => {
    res.send(`
      <html>
        <body>
          <h1>Development Mode</h1>
          <p>Start the webapp dev server: <code>cd webapp && npm run dev</code></p>
          <p>Then visit: <a href="http://localhost:5173">http://localhost:5173</a></p>
        </body>
      </html>
    `);
  });
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  
  if (!sessionId) {
    ws.close(1008, 'Session ID required');
    return;
  }

  // Add client to session
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new Set());
  }
  sessions.get(sessionId)!.add(ws);

  console.log(`Client connected to session: ${sessionId}`);

  ws.on('close', () => {
    // Remove client from session
    const sessionClients = sessions.get(sessionId);
    if (sessionClients) {
      sessionClients.delete(ws);
      if (sessionClients.size === 0) {
        sessions.delete(sessionId);
      }
    }
    console.log(`Client disconnected from session: ${sessionId}`);
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`Received message from session ${sessionId}:`, data);
      
      if (data.type === 'move' && data.move) {
        // Broadcast the move to all clients in the session
        broadcastToSession(sessionId, { 
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Placeholder - should be handled by game logic
          san: data.move 
        });
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Function to broadcast updates to all clients in a session
export function broadcastToSession(sessionId: string, data: { fen: string; san?: string; pgn?: string; isCheckmate?: boolean }) {
  const sessionClients = sessions.get(sessionId);
  if (sessionClients) {
    const message = JSON.stringify(data);
    sessionClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Telegram webhook endpoint
app.use('/bot', bot.webhookCallback('/bot'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import command handlers
import { handleNewGame, handleMove, handleResign, handleCallbackQuery } from './telechess/commands';

// Set up bot commands
bot.start((ctx) => {
  ctx.reply('Welcome to TeleChess! ♟️\nSend /new @opponent to start a game.');
});

bot.help((ctx) => {
  ctx.reply(
    'TeleChess Commands:\n' +
    '/new @opponent - Start a new game\n' +
    '/resign - Resign current game\n' +
    'Send moves in algebraic notation (e.g., e4, Nf3, O-O)\n' +
    'Click "Launch Mini App" for interactive board'
  );
});

// Register command handlers
bot.command('new', handleNewGame);
bot.command('resign', handleResign);
bot.on('callback_query', handleCallbackQuery);
bot.on('text', handleMove);

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('Something went wrong. Please try again.');
});

// Start server
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  
  // For development, always use polling mode (simpler to test)
  if (process.env.NODE_ENV === 'production' && process.env.PUBLIC_URL) {
    const webhookUrl = `${process.env.PUBLIC_URL}/bot`;
    // Create a valid secret token (only alphanumeric characters allowed)
    const secretToken = process.env.TELE_TOKEN!.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
    
    bot.telegram.setWebhook(webhookUrl, { 
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query', 'inline_query']
    })
      .then(() => console.log(`📡 Webhook set to: ${webhookUrl}`))
      .catch(err => console.error('Failed to set webhook:', err));
  } else {
    console.log('🔄 Using polling mode for development');
    console.log('🔑 Bot token:', process.env.TELE_TOKEN ? 'Present' : 'Missing');
    // For local development, use polling (easier to debug)
    bot.launch()
      .then(() => console.log('🤖 Bot launched in polling mode'))
      .catch(err => console.error('❌ Failed to launch bot:', err));
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  bot.stop('SIGINT');
  server.close(() => {
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  bot.stop('SIGTERM');
  server.close(() => {
    process.exit(0);
  });
});

export { bot, app }; 