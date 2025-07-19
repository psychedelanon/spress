import express from 'express';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import http from 'http';
import path from 'node:path';
import fs from 'node:fs';
import { initWS, setBotInstance } from './wsHub';
import { registerUser } from './store/db';
import { games, loadGames, purgeFinished } from './store/games';
import { loadStats, saveStatsPeriodically, saveStats } from './store/stats';
import { log } from './log';
import { Counter, register } from 'prom-client';
import { t } from './i18n';
import rateLimit from 'telegraf-ratelimit';
import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import './store/db'; // Initialize user registry

dotenv.config();

const logger = log;
dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
export const userPrefs: Record<number, { lang: string }> = {};
// Map of telegramId -> sessionId for quick lookup of active games
export const activeSessions = new Map<number, string>();

const cmds = new Counter({ name: 'commands_total', help: 'total cmds' });

Sentry.init({ dsn: process.env.SENTRY_DSN || '' });

loadStats();
loadGames();
saveStatsPeriodically();
cron.schedule('0 3 * * *', () => {
  purgeFinished(30);
});

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

// Serve webapp static files if built, otherwise show development hint
{
  const webappDistPath = path.join(__dirname, '../webapp/dist');
  const webappIndexPath = path.join(webappDistPath, 'index.html');
  const hasWebappBuild = fs.existsSync(webappIndexPath);

  logger.info('🌐 Webapp build ' + (hasWebappBuild ? 'found' : 'not found'));

  if (hasWebappBuild) {
    app.use('/webapp', express.static(webappDistPath, { maxAge: '1h' }));
    app.use('/webapp/pieces', express.static(path.join(webappDistPath, 'pieces'), { maxAge: '1h' }));

    const serveIndex = (_req: express.Request, res: express.Response) => {
      res.sendFile(webappIndexPath, err => {
        if (err) {
          logger.error({ err }, 'Failed to serve webapp index.html');
          res.status(500).send('Error loading app interface.');
        }
      });
    };

    app.get('/webapp/*', serveIndex);
    app.get('/bot', serveIndex);
  } else {
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

// Lookup current session for a telegram user
app.get('/api/session', (req, res) => {
  const telegramId = Number(req.query.telegramId);
  if (!telegramId) {
    return res.status(400).json({ error: 'telegramId required' });
  }
  const sessionId = activeSessions.get(telegramId);
  if (!sessionId) {
    return res.sendStatus(404);
  }
  const game = games.get(sessionId);
  if (!game) {
    return res.sendStatus(404);
  }
  // Determine color for this user
  let color = 'w';
  if (game.players.b.id === telegramId) color = 'b';
  res.json({ sessionId, color });
});

// Import command handlers
import { handleNewGame, handleSoloGame, handleMove, handleResign, handleCallbackQuery, handleStats, handleLeaderboard, registerSpectateHandler } from './telechess/commands';

// Set up bot commands
if (bot) {
  bot.use(rateLimit({
    window: 10000,
    limit: 5,
    keyGenerator: ctx => String(ctx.from?.id)
  }));
  bot.start((ctx) => {
    // Register user for DM capability
    if (ctx.from && ctx.chat) {
      registerUser(ctx.from.id, ctx.chat.id, ctx.from.username);
      logger.info(`User ${ctx.from.id} (${ctx.from.username || 'unnamed'}) registered for DMs`);
      userPrefs[ctx.from.id] = { lang: ctx.from.language_code?.slice(0, 2) ?? 'en' };
    }
    ctx.reply('Welcome to SPRESS Chess! ♟️\nSend /new @opponent to start a game or /solo to play against AI.');
  });

  bot.help((ctx) => {
    const lang = userPrefs[ctx.from?.id || 0]?.lang;
    ctx.reply(t('help', { lng: lang }));
  });

  // Register command handlers
  bot.command('new', handleNewGame);
bot.command('solo', handleSoloGame);
bot.command('resign', handleResign);
bot.command('stats', handleStats);
  bot.command('leaderboard', handleLeaderboard);
  registerSpectateHandler(bot);

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
    const t = Date.now();
    if (ctx.from && ctx.chat) {
      registerUser(ctx.from.id, ctx.chat.id, ctx.from.username);
      if (!userPrefs[ctx.from.id]) {
        userPrefs[ctx.from.id] = { lang: ctx.from.language_code?.slice(0, 2) ?? 'en' };
      }
    }
    await next();
    cmds.inc();
    logger.info({ type: ctx.updateType, ms: Date.now() - t });
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

http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.end(await register.metrics());
  }
}).listen(process.env.METRICS_PORT || 9000);

export { bot, app };
