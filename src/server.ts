import express from 'express';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import http from 'http';
import path from 'node:path';
import { initWS, setBotInstance } from './wsHub';
import { registerUser, games } from './store/db';
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
  const webappDistPath = path.join(__dirname, '../webapp/dist');
  const webappIndexPath = path.join(webappDistPath, 'index.html');
  
  console.log('🌐 Setting up webapp static files...');
  console.log('   Dist path:', webappDistPath);
  console.log('   Index path:', webappIndexPath);
  
  // Serve static files
  app.use('/webapp', express.static(webappDistPath, { maxAge: '1h' }));
  
  // Explicit route for pieces (fallback safety - ensures PNGs are accessible)
  app.use('/webapp/pieces', express.static(path.join(webappDistPath, 'pieces'), { maxAge: '1h' }));
  
  // Serve index.html for all webapp routes
  app.get('/webapp/*', (_req, res) => {
    res.sendFile(webappIndexPath, (err) => {
      if (err) {
        console.error('Failed to serve webapp index.html:', err);
        res.status(500).send(`
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
      }
    });
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
    // Register user for DM capability
    if (ctx.from && ctx.chat) {
      registerUser(ctx.from.id, ctx.chat.id, ctx.from.username);
      console.log(`User ${ctx.from.id} (${ctx.from.username || 'unnamed'}) registered for DMs`);
    }
    ctx.reply('Welcome to SPRESS Chess! ♟️\nSend /new @opponent to start a game or /solo to play against AI.');
  });

  bot.help((ctx) => {
    ctx.reply(
      'SPRESS Chess Commands:\n' +
      '/new @opponent - Start a new game\n' +
      '/solo - Play vs AI\n' +
      '/resign - Resign current game\n' +
      'Use the interactive board to make moves\n' +
      'Click "♟️ Launch SPRESS Board" to play'
    );
  });

  // Register command handlers
  bot.command('new', handleNewGame);
bot.command('solo', handleSoloGame);
bot.command('resign', handleResign);

// Reset command for testing (admin only)
bot.command('reset', (ctx) => {
  const adminId = Number(process.env.ADMIN_ID);
  if (!adminId || ctx.from!.id !== adminId) {
    return ctx.reply('❌ Access denied');
  }
  
  games.clear();
  ctx.reply('💥 All games cleared.');
  console.log(`Admin ${ctx.from!.username} cleared all games`);
});
  bot.on('callback_query', handleCallbackQuery);
  bot.on('text', handleMove);

  // Register users on any interaction
  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.chat) {
      registerUser(ctx.from.id, ctx.chat.id, ctx.from.username);
    }
    return next();
  });

  // Error handling
  bot.catch((err, ctx) => {
    console.error('Bot error', err);
    ctx.reply('⚠️ Something went wrong. Please try again.').catch(() => {});
  });
}

// Start server
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  
  // In production (Railway), use webhooks; in development, use polling
  if (bot) {
    if (process.env.NODE_ENV === 'production') {
      console.log('🔗 Production mode - bot will use webhooks');
      // Webhook is set up via /bot endpoint - no polling needed
    } else {
      console.log('🔄 Development mode - using polling');
      bot.launch()
        .then(() => console.log('🤖 Bot launched in polling mode'))
        .catch(err => console.error('❌ Failed to launch bot:', err));
    }
  } else {
    console.log('🚫 Bot not initialized - skipping bot setup');
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (bot && process.env.NODE_ENV !== 'production') {
    bot.stop('SIGINT');
  }
  server.close(() => {
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (bot && process.env.NODE_ENV !== 'production') {
    bot.stop('SIGTERM');
  }
  server.close(() => {
    process.exit(0);
  });
});

export { bot, app }; 