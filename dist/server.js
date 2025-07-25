"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.bot = exports.userPrefs = void 0;
const express_1 = __importDefault(require("express"));
const telegraf_1 = require("telegraf");
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const wsHub_1 = require("./wsHub");
const db_1 = require("./store/db");
const games_1 = require("./store/games");
const stats_1 = require("./store/stats");
const log_1 = require("./log");
const prom_client_1 = require("prom-client");
const i18n_1 = require("./i18n");
const telegraf_ratelimit_1 = __importDefault(require("telegraf-ratelimit"));
const node_cron_1 = __importDefault(require("node-cron"));
const Sentry = __importStar(require("@sentry/node"));
require("./store/db"); // Initialize user registry
dotenv_1.default.config();
const logger = log_1.log;
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
const port = process.env.PORT || 3000;
exports.userPrefs = {};
exports.activeSessions = new Map();
const cmds = new prom_client_1.Counter({ name: 'commands_total', help: 'total cmds' });
Sentry.init({ dsn: process.env.SENTRY_DSN || '' });
(0, stats_1.loadStats)();
(0, games_1.loadGames)();
(0, stats_1.saveStatsPeriodically)();
node_cron_1.default.schedule('0 3 * * *', () => {
    (0, games_1.purgeFinished)(30);
});
// Initialize Telegram bot
logger.info('🔧 Initializing bot...');
let bot = null;
exports.bot = bot;
if (!process.env.TELE_TOKEN) {
    logger.warn('⚠️ TELE_TOKEN not set - bot will not work until configured');
    logger.info('🔧 Server starting without bot functionality...');
}
else {
    exports.bot = bot = new telegraf_1.Telegraf(process.env.TELE_TOKEN);
    logger.info('✅ Bot instance created');
}
// Initialize WebSocket server for real-time board updates
(0, wsHub_1.initWS)(server);
// Connect bot instance to WebSocket hub for turn notifications
if (bot) {
    (0, wsHub_1.setBotInstance)(bot);
}
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.static('public'));
// Serve webapp static files if built, otherwise show development hint
{
    const webappDistPath = node_path_1.default.join(__dirname, '../webapp/dist');
    const webappIndexPath = node_path_1.default.join(webappDistPath, 'index.html');
    const hasWebappBuild = node_fs_1.default.existsSync(webappIndexPath);
    logger.info('🌐 Webapp build ' + (hasWebappBuild ? 'found' : 'not found'));
    if (hasWebappBuild) {
        app.use('/webapp', express_1.default.static(webappDistPath, { maxAge: '1h' }));
        app.use('/webapp/pieces', express_1.default.static(node_path_1.default.join(webappDistPath, 'pieces'), { maxAge: '1h' }));
        const serveIndex = (_req, res) => {
            res.sendFile(webappIndexPath, err => {
                if (err) {
                    logger.error({ err }, 'Failed to serve webapp index.html');
                    res.status(500).send('Error loading app interface.');
                }
            });
        };
        app.get('/webapp/*', serveIndex);
        app.get('/bot', serveIndex);
    }
    else {
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
    const sessionId = exports.activeSessions.get(telegramId);
    if (!sessionId) {
        return res.sendStatus(404);
    }
    const game = games_1.games.get(sessionId);
    if (!game) {
        return res.sendStatus(404);
    }
    let color = 'w';
    if (game.players.b.id === telegramId)
        color = 'b';
    res.json({ sessionId, color });
});
// Import command handlers
const commands_1 = require("./telechess/commands");
// Set up bot commands
if (bot) {
    bot.use((0, telegraf_ratelimit_1.default)({
        window: 10000,
        limit: 5,
        keyGenerator: ctx => String(ctx.from?.id)
    }));
    bot.start((ctx) => {
        // Register user for DM capability
        if (ctx.from && ctx.chat) {
            (0, db_1.registerUser)(ctx.from.id, ctx.chat.id, ctx.from.username);
            logger.info(`User ${ctx.from.id} (${ctx.from.username || 'unnamed'}) registered for DMs`);
            exports.userPrefs[ctx.from.id] = { lang: ctx.from.language_code?.slice(0, 2) ?? 'en' };
        }
        ctx.reply('Welcome to SPRESS Chess! ♟️\nSend /new @opponent to start a game or /solo to play against AI.');
    });
    bot.help((ctx) => {
        const lang = exports.userPrefs[ctx.from?.id || 0]?.lang;
        ctx.reply((0, i18n_1.t)('help', { lng: lang }));
    });
    // Register command handlers
    bot.command('new', commands_1.handleNewGame);
    bot.command('solo', commands_1.handleSoloGame);
    bot.command('resign', commands_1.handleResign);
    bot.command('stats', commands_1.handleStats);
    bot.command('leaderboard', commands_1.handleLeaderboard);
    (0, commands_1.registerSpectateHandler)(bot);
    // Reset command for testing (admin only)
    bot.command('reset', (ctx) => {
        const adminId = Number(process.env.ADMIN_ID);
        if (!adminId || ctx.from.id !== adminId) {
            return ctx.reply('❌ Access denied');
        }
        games_1.games.clear();
        ctx.reply('💥 All games cleared.');
        logger.info(`Admin ${ctx.from.username} cleared all games`);
    });
    bot.on('callback_query', commands_1.handleCallbackQuery);
    bot.on('text', commands_1.handleMove);
    bot.on('my_chat_member', ctx => {
        if (ctx.myChatMember.new_chat_member?.status === 'member')
            ctx.telegram.sendMessage(ctx.chat.id, '🙋‍♂️  Hi!  /new @opponent to start a chess match.  /help for full guide.');
    });
    // Register users on any interaction
    bot.use(async (ctx, next) => {
        const t = Date.now();
        if (ctx.from && ctx.chat) {
            (0, db_1.registerUser)(ctx.from.id, ctx.chat.id, ctx.from.username);
            if (!exports.userPrefs[ctx.from.id]) {
                exports.userPrefs[ctx.from.id] = { lang: ctx.from.language_code?.slice(0, 2) ?? 'en' };
            }
        }
        await next();
        cmds.inc();
        logger.info({ type: ctx.updateType, ms: Date.now() - t });
    });
    // Error handling
    bot.catch((err, ctx) => {
        logger.error({ err }, 'Bot error');
        ctx.reply('⚠️ Something went wrong. Please try again.').catch(() => { });
    });
}
// Start server
server.listen(port, () => {
    logger.info(`🚀 Server running on port ${port}`);
    // In production use webhooks; in development, use polling
    if (bot) {
        if (process.env.NODE_ENV === 'production') {
            logger.info('🔗 Production mode - bot will use webhooks');
            // Automatically set webhook URL
            const webhookUrl = `${process.env.PUBLIC_URL || 'https://example.fly.dev'}/bot`;
            logger.info(`🔗 Setting webhook to: ${webhookUrl}`);
            bot.telegram.setWebhook(webhookUrl)
                .then(() => logger.info('✅ Webhook set successfully'))
                .catch(err => logger.error({ err }, '❌ Failed to set webhook'));
        }
        else {
            logger.info('🔄 Development mode - using polling');
            bot.launch()
                .then(() => logger.info('🤖 Bot launched in polling mode'))
                .catch(err => logger.error({ err }, '❌ Failed to launch bot'));
        }
    }
    else {
        logger.warn('🚫 Bot not initialized - skipping bot setup');
    }
});
// Graceful shutdown
process.once('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    if (bot && process.env.NODE_ENV !== 'production') {
        bot.stop('SIGINT');
    }
    (0, stats_1.saveStats)();
    server.close(() => {
        process.exit(0);
    });
});
process.once('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    if (bot && process.env.NODE_ENV !== 'production') {
        bot.stop('SIGTERM');
    }
    (0, stats_1.saveStats)();
    server.close(() => {
        process.exit(0);
    });
});
http_1.default.createServer(async (req, res) => {
    if (req.url === '/metrics') {
        res.end(await prom_client_1.register.metrics());
    }
}).listen(process.env.METRICS_PORT || 9000);
