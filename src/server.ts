import express from 'express';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import http from 'http';
import path from 'node:path';
import { initWS, setBotInstance } from './wsHub';
import './store/db'; // Initialize database

dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialize Telegram bot
console.log('🔧 Initializing bot...');
let bot: Telegraf | null = null;
if (!process.env.TELE_TOKEN) {
  console.warn('⚠️ TELE_TOKEN not set - bot will not work until configured');
  console.log('🔧 Server starting without bot functionality...');
} else {
  bot = new Telegraf(process.env.TELE_TOKEN);
  console.log('✅ Bot instance created');
}

// Initialize WebSocket server for real-time board updates
initWS(server);

// Connect bot instance to WebSocket hub for turn notifications
if (bot) {
  setBotInstance(bot);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve webapp static files in production or fallback
if (process.env.NODE_ENV === 'production') {
  try {
    app.use(
      '/webapp',
      express.static(path.join(__dirname, '../webapp/dist'), { maxAge: '1h' })
    );
    app.get('/webapp/*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../webapp/dist/index.html'));
    });
  } catch (error) {
    console.warn('⚠️ Webapp dist not found, serving fallback');
    app.get('/webapp/*', (_req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>SPRESS Chess</title></head>
        <body style="background:#00102E;color:#FFD700;font-family:system-ui;text-align:center;padding:50px;">
          <h1>🏗️ SPRESS Chess</h1>
          <p>Mini App is being built...</p>
          <p>Use bot commands for now: /new @username</p>
          <p>Check back soon for the interactive board!</p>
        </body>
        </html>
      `);
    });
  }
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

// WebSocket handling is now done in wsHub.ts

// Telegram webhook endpoint
if (bot) {
  app.post('/bot', bot.webhookCallback('/bot'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import command handlers
import { handleNewGame, handleSoloGame, handleMove, handleResign, handleCallbackQuery } from './telechess/commands';

// Set up bot commands
if (bot) {
  bot.start((ctx) => {
    ctx.reply('Welcome to SPRESS Chess! ♟️\nSend /new @opponent to start a game.');
  });

  bot.help((ctx) => {
    ctx.reply(
      'SPRESS Chess Commands:\n' +
      '/new @opponent - Start a new game\n' +
      '/resign - Resign current game\n' +
      'Use the interactive board to make moves\n' +
      'Click "♟️ Launch SPRESS Board" to play'
    );
  });

  // Register command handlers
  bot.command('new', handleNewGame);
bot.command('solo', handleSoloGame);
bot.command('resign', handleResign);
  bot.on('callback_query', handleCallbackQuery);
  bot.on('text', handleMove);

  // Error handling
  bot.catch((err, ctx) => {
    console.error('Bot error', err);
    ctx.reply('⚠️ Something went wrong. Please try again.').catch(() => {});
  });
}

// Start server
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  
  // Use polling for now to test bot functionality
  if (bot) {
    console.log('🔄 Using polling mode for testing');
    bot.launch()
      .then(() => console.log('🤖 Bot launched in polling mode'))
      .catch(err => console.error('❌ Failed to launch bot:', err));
  } else {
    console.log('🚫 Bot not initialized - skipping bot setup');
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (bot) bot.stop('SIGINT');
  server.close(() => {
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (bot) bot.stop('SIGTERM');
  server.close(() => {
    process.exit(0);
  });
});

export { bot, app }; 