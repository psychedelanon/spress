import express from 'express';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import http from 'http';
import path from 'node:path';
import { initWS, setBotInstance } from './wsHub';
import { registerUser } from './store/db';
import { games, loadGames } from './store/games';
import { loadStats, saveStatsPeriodically, saveStats } from './store/stats';
import pino from 'pino';
import * as Sentry from '@sentry/node';
import './store/db'; // Initialize user registry

dotenv.config();

const logger = pino();
dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

Sentry.init({ dsn: process.env.SENTRY_DSN || '' });

loadStats();
loadGames();
saveStatsPeriodically();

// Initialize Telegram bot
logger.info('🔧 Initializing bot...');
let bot: Telegraf | null = null;
if (!process.env.TELE_TOKEN) {
  logger.warn('⚠️ TELE_TOKEN not set - bot will not work until configured');
  logger.info('🔧 Server starting without bot functionality...');
} else {
  bot = new Telegraf(process.env.TELE_TOKEN);
  logger.info('✅ Bot instance created');
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
  
  logger.info('🌐 Setting up webapp static files...');
  logger.info({ webappDistPath, webappIndexPath }, 'paths');
  
  // Serve static files
  app.use('/webapp', express.static(webappDistPath, { maxAge: '1h' }));
  
  // Explicit route for pieces (fallback safety - ensures PNGs are accessible)
  app.use('/webapp/pieces', express.static(path.join(webappDistPath, 'pieces'), { maxAge: '1h' }));
  
  // Serve index.html for all webapp routes
  app.get('/webapp/*', (_req, res) => {
    res.sendFile(webappIndexPath, (err) => {
      if (err) {
        logger.error({ err }, 'Failed to serve webapp index.html');
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

// Redirect root to webapp in production
if (process.env.NODE_ENV === 'production') {
  app.get('/', (req, res) => {
    res.redirect('/webapp/');
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import command handlers
import { handleNewGame, handleSoloGame, handleMove, handleResign, handleCallbackQuery, handleStats, handleLeaderboard } from './telechess/commands';

// Set up bot commands
if (bot) {
  bot.start((ctx) => {
    // Register user for DM capability
    if (ctx.from && ctx.chat) {
      registerUser(ctx.from.id, ctx.chat.id, ctx.from.username);
      logger.info(`User ${ctx.from.id} (${ctx.from.username || 'unnamed'}) registered for DMs`);
    }
    ctx.reply('Welcome to SPRESS Chess! ♟️\nSend /new @opponent to start a game or /solo to play against AI.');
  });

  bot.help((ctx) => {
    ctx.reply(
      'SPRESS Chess Commands:\n' +
      '/new @opponent - Start a new game\n' +
      '/solo - Play vs AI\n' +
      '/resign - Resign current game\n' +
      '/stats - Show your stats\n' +
      'Use the interactive board to make moves\n' +
      'Click "♟️ Launch SPRESS Board" to play'
    );
  });

  // Register command handlers
  bot.command('new', handleNewGame);
bot.command('solo', handleSoloGame);
bot.command('resign', handleResign);
bot.command('stats', handleStats);
bot.command('leaderboard', handleLeaderboard);

// Reset command for testing (admin only)
bot.command('reset', (ctx) => {
  const adminId = Number(process.env.ADMIN_ID);
  if (!adminId || ctx.from!.id !== adminId) {
    return ctx.reply('❌ Access denied');
  }
  
  games.clear();
  ctx.reply('💥 All games cleared.');
  logger.info(`Admin ${ctx.from!.username} cleared all games`);
});
  bot.on('callback_query', handleCallbackQuery);
  bot.on('text', handleMove);

  bot.on('my_chat_member', ctx => {
    if (ctx.myChatMember.new_chat_member?.status === 'member')
      ctx.telegram.sendMessage(ctx.chat.id, '🙋‍♂️  Hi!  /new @opponent to start a chess match.  /help for full guide.');
  });

  // Register users on any interaction
  bot.use(async (ctx, next) => {
    const started = Date.now();
    if (ctx.from && ctx.chat) {
      registerUser(ctx.from.id, ctx.chat.id, ctx.from.username);
    }
    await next();
    const ms = Date.now() - started;
    logger.info({ type: ctx.updateType, ms }, 'update');
  });

  // Error handling
  bot.catch((err, ctx) => {
    logger.error({ err }, 'Bot error');
    ctx.reply('⚠️ Something went wrong. Please try again.').catch(() => {});
  });
}

// Start server
server.listen(port, () => {
  logger.info(`🚀 Server running on port ${port}`);
  
  // In production (Railway), use webhooks; in development, use polling
  if (bot) {
    if (process.env.NODE_ENV === 'production') {
      logger.info('🔗 Production mode - bot will use webhooks');
      
      // Automatically set webhook URL
      const webhookUrl = `${process.env.PUBLIC_URL || 'https://spress-production.up.railway.app'}/bot`;
      logger.info(`🔗 Setting webhook to: ${webhookUrl}`);
      
      bot.telegram.setWebhook(webhookUrl)
        .then(() => logger.info('✅ Webhook set successfully'))
        .catch(err => logger.error({ err }, '❌ Failed to set webhook'));
    } else {
      logger.info('🔄 Development mode - using polling');
      bot.launch()
        .then(() => logger.info('🤖 Bot launched in polling mode'))
        .catch(err => logger.error({ err }, '❌ Failed to launch bot'));
    }
  } else {
    logger.warn('🚫 Bot not initialized - skipping bot setup');
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  if (bot && process.env.NODE_ENV !== 'production') {
    bot.stop('SIGINT');
  }
  saveStats();
  server.close(() => {
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (bot && process.env.NODE_ENV !== 'production') {
    bot.stop('SIGTERM');
  }
  saveStats();
  server.close(() => {
    process.exit(0);
  });
});

export { bot, app }; 