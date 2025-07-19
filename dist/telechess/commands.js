"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSoloGame = handleSoloGame;
exports.handleNewGame = handleNewGame;
exports.handleMove = handleMove;
exports.handleResign = handleResign;
exports.handlePgn = handlePgn;
exports.handleHistory = handleHistory;
exports.handleCallbackQuery = handleCallbackQuery;
exports.handleStats = handleStats;
exports.handleLeaderboard = handleLeaderboard;
exports.registerSpectateHandler = registerSpectateHandler;
exports.configureTelegramBot = configureTelegramBot;
// Import GameSession types for potential future use
const ensureHttps_1 = require("../utils/ensureHttps");
const boardText_1 = require("../utils/boardText");
const db_1 = require("../store/db");
const games_1 = require("../store/games");
const stats_1 = require("../store/stats");
const i18n_1 = require("../i18n");
const server_1 = require("../server");
const log_1 = require("../log");
const WEBAPP_URL = process.env.WEBAPP_URL ||
    `${(0, ensureHttps_1.ensureHttps)(process.env.PUBLIC_URL || 'localhost:3000')}/webapp/`;
const pendingChallenges = new Map();
function expireChallenge(id) {
    const c = pendingChallenges.get(id);
    if (!c)
        return;
    const lang = server_1.userPrefs[c.challenger.id]?.lang || 'en';
    c.telegram.editMessageText(c.chatId, c.messageId, undefined, (0, i18n_1.t)('challengeTimeout', { lng: lang })).catch(() => { });
    pendingChallenges.delete(id);
}
// Helper function to generate session ID
function generateSessionId(player1Id, player2Id) {
    const sortedIds = [player1Id, player2Id].sort();
    return `game_${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`;
}
// Helper function to create inline keyboard with Mini App button
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createGameKeyboard(sessionId, playerColor) {
    const base = (0, ensureHttps_1.ensureHttps)(process.env.PUBLIC_URL || 'localhost:3000');
    const url = `${base}/webapp/?session=${sessionId}&color=${playerColor}`;
    return {
        inline_keyboard: [
            [
                { text: '♟️ Launch SPRESS Board', web_app: { url } }
            ],
            [
                { text: '📋 Show Board', callback_data: `show_board_${sessionId}` },
                { text: '📜 Show Moves', callback_data: `show_moves_${sessionId}` }
            ],
            [
                { text: '🏳️ Resign', callback_data: `resign_${sessionId}` }
            ],
            [
                { text: 'ℹ️ How to Play', callback_data: `help_${sessionId}` }
            ]
        ]
    };
}
// /solo command handler
async function handleSoloGame(ctx) {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'Player';
    const chatId = ctx.chat.id;
    if (Array.from(games_1.games.values()).some(g => !g.winner && g.chatId === chatId && (g.players.w.id === userId || g.players.b.id === userId))) {
        return ctx.reply('Finish or /resign your current game first.');
    }
    let level = null;
    const state = ctx.state;
    const override = state.soloLevel;
    if (typeof override === 'number') {
        level = override;
    }
    else {
        const parts = ('text' in ctx.message ? ctx.message.text.split(' ') : []);
        const arg = parts[1];
        if (arg) {
            const a = arg.toLowerCase();
            if (a === 'easy')
                level = 2;
            else if (a === 'medium' || a === 'med')
                level = 10;
            else if (a === 'hard')
                level = 15;
            else if (/^\d+$/.test(a))
                level = Math.min(20, Math.max(0, parseInt(a, 10)));
        }
    }
    if (level === null) {
        return ctx.reply('Pick AI difficulty', {
            reply_markup: { inline_keyboard: [[
                        { text: 'Easy', callback_data: 'solo_easy' },
                        { text: 'Med', callback_data: 'solo_med' },
                        { text: 'Hard', callback_data: 'solo_hard' }
                    ]] }
        });
    }
    // Clean up any existing games for this user
    for (const [gameId, game] of games_1.games.entries()) {
        if (game.players.w.id === userId || game.players.b?.id === userId) {
            console.log(`Cleaning up previous game ${gameId} for user ${userId}`);
            games_1.games.delete(gameId);
        }
    }
    // Register user for DM capability
    (0, db_1.registerUser)(userId, chatId, username);
    // Get the proper DM chat ID for the user
    const user = (0, db_1.getUser)(userId);
    const userDmChatId = user?.dmChatId || 0;
    const sessionId = `solo-${userId}-${Date.now()}`;
    // Create new game session with proper structure
    const gameSession = {
        id: sessionId,
        chatId,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        mode: 'ai',
        lastMoveAt: Date.now(),
        pgn: '',
        players: {
            w: {
                id: userId,
                username,
                dmChatId: userDmChatId,
                color: 'w'
            },
            b: {
                id: -1,
                username: 'AI',
                color: 'b',
                isAI: true
            }
        }
    };
    gameSession.aiLevel = level;
    games_1.games.set(sessionId, gameSession);
    // Persist to database
    (0, games_1.insertGame)(gameSession);
    const base = (0, ensureHttps_1.ensureHttps)(process.env.PUBLIC_URL || 'localhost:3000');
    const url = `${base}/webapp/?session=${sessionId}&color=w`;
    await ctx.reply('🤖 Solo Mode - You vs AI', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🤖 Play Solo', web_app: { url } }]
            ]
        }
    });
}
// /new command handler
async function handleNewGame(ctx) {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'Player';
    const chatId = ctx.chat.id;
    const args = ('text' in ctx.message ? ctx.message.text : '').split(' ');
    if (args.length < 2 || !args[1].startsWith('@')) {
        return ctx.reply('Usage: /new @username\nExample: /new @alice');
    }
    const opponentUsername = args[1].substring(1);
    // Determine opponent user ID if command was a reply
    let opponentId;
    if ('reply_to_message' in ctx.message && ctx.message.reply_to_message?.from) {
        opponentId = ctx.message.reply_to_message.from.id;
    }
    (0, db_1.registerUser)(userId, chatId, username);
    // Get the proper DM chat ID for the challenger
    const challengerUser = (0, db_1.getUser)(userId);
    const challengerDmChatId = challengerUser?.dmChatId || 0;
    const sessionId = generateSessionId(userId, opponentId || Date.now());
    const message = await ctx.reply(`@${opponentUsername}, you have been challenged to a game!`, {
        reply_markup: {
            inline_keyboard: [[{ text: 'Accept challenge', callback_data: `accept_${sessionId}` }]]
        }
    });
    pendingChallenges.set(sessionId, {
        sessionId,
        chatId,
        challenger: { id: userId, username, dmChatId: challengerDmChatId, color: 'w' },
        opponent: { id: opponentId, username: opponentUsername },
        messageId: message.message_id,
        telegram: ctx.telegram
    });
    setTimeout(() => expireChallenge(sessionId), 5 * 60 * 1000);
}
// Handle text messages - only respond to potential chess moves or meaningful interactions
function handleMove(ctx) {
    const message = ctx.message;
    if (!message || !('text' in message) || !ctx.from)
        return;
    const text = message.text.trim();
    // Allow commands to pass through
    if (text.startsWith('/'))
        return;
    // Register user for DM capability (silently)
    if (ctx.chat) {
        (0, db_1.registerUser)(ctx.from.id, ctx.chat.id, ctx.from.username);
    }
    // Only respond to text that looks like potential chess moves or game-related queries
    const chessPattern = /^[a-h][1-8][a-h][1-8][qrnb]?$/i; // Standard chess notation like "e2e4"
    const algebraicPattern = /^[NBRQK]?[a-h]?[1-8]?[x]?[a-h][1-8][+#]?$/i; // Algebraic notation like "Nf3"
    const gameKeywords = /(board|move|game|position|help|resign|status|turn)/i;
    // Only respond if it looks like a chess move or contains game-related keywords
    if (chessPattern.test(text) || algebraicPattern.test(text) || gameKeywords.test(text)) {
        return ctx.reply('♟️ Please open the SPRESS board and move pieces there ↗️');
    }
    // For all other text, don't respond - let it be a normal conversation
    return;
}
// /resign command handler
function handleResign(ctx) {
    if (!ctx.from)
        return;
    const userId = ctx.from.id;
    // Find active game for this user
    let userGame;
    for (const game of games_1.games.values()) {
        if (game.chatId === ctx.chat.id && (game.players.w.id === userId || game.players.b.id === userId)) {
            userGame = game;
            break;
        }
    }
    if (!userGame) {
        ctx.reply('❌ You have no active game to resign from.');
        return;
    }
    // Determine winner
    const isWhite = userGame.players.w.id === userId;
    const winner = isWhite ? 'Black' : 'White';
    const playerColor = isWhite ? 'White' : 'Black';
    // Mark game as finished
    userGame.winner = winner;
    const result = isWhite ? 'black' : 'white';
    (0, stats_1.recordResult)(userGame.players.w.id, userGame.players.b.id, result, userGame.mode, ctx.chat.id);
    // Remove from active games
    games_1.games.delete(userGame.id);
    (0, games_1.deleteGame)(userGame.id);
    ctx.reply(`🏳️ You resigned as ${playerColor}. ${winner} wins!`);
}
function getLastGameId(userId) {
    const list = Array.from(games_1.games.values())
        .filter(g => g.players.w.id === userId || g.players.b.id === userId)
        .sort((a, b) => b.lastMoveAt - a.lastMoveAt);
    return list[0]?.id;
}
async function handlePgn(ctx) {
    if (!ctx.from)
        return;
    const parts = ('text' in ctx.message ? ctx.message.text.split(' ') : []);
    const arg = parts[1];
    const id = arg || getLastGameId(ctx.from.id);
    if (!id)
        return ctx.reply('Game not found.');
    const game = games_1.games.get(id);
    if (!game || !game.pgn)
        return ctx.reply('Game not found.');
    await ctx.replyWithDocument({ filename: `chess-${id}.pgn`, source: Buffer.from(game.pgn) }, { caption: 'Here is your PGN.' });
}
async function handleHistory(ctx) {
    if (!ctx.from)
        return;
    const finished = Array.from(games_1.games.values())
        .filter(g => g.winner && (g.players.w.id === ctx.from.id || g.players.b.id === ctx.from.id))
        .sort((a, b) => b.lastMoveAt - a.lastMoveAt)
        .slice(0, 5);
    if (!finished.length)
        return ctx.reply('No recent games');
    const buttons = finished.map(g => [{ text: `PGN ${g.id}`, callback_data: `pgn_${g.id}` }]);
    await ctx.reply('Recent games:', { reply_markup: { inline_keyboard: buttons } });
}
// Handle callback queries (inline button presses)
async function handleCallbackQuery(ctx) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery))
        return;
    const data = callbackQuery.data;
    if (data.startsWith('show_board_')) {
        const sessionId = data.replace('show_board_', '');
        const game = games_1.games.get(sessionId);
        if (!game) {
            ctx.answerCbQuery('Game not found');
            return;
        }
        ctx.answerCbQuery();
        const fen = game.fen;
        const boardText = (0, boardText_1.boardTextFromFEN)(fen);
        await ctx.reply(boardText, { parse_mode: 'Markdown' });
    }
    else if (data.startsWith('show_moves_')) {
        const sessionId = data.replace('show_moves_', '');
        const game = games_1.games.get(sessionId);
        if (!game) {
            ctx.answerCbQuery('Game not found');
            return;
        }
        const moves = game.pgn || 'No moves yet';
        ctx.answerCbQuery();
        ctx.reply(`📜 Game moves:\n\`${moves}\``, { parse_mode: 'Markdown' });
    }
    else if (data.startsWith('pgn_')) {
        const id = data.replace('pgn_', '');
        const game = games_1.games.get(id);
        if (!game || !game.pgn) {
            ctx.answerCbQuery('Game not found');
            return;
        }
        ctx.answerCbQuery();
        await ctx.replyWithDocument({ filename: `chess-${id}.pgn`, source: Buffer.from(game.pgn) });
    }
    else if (data.startsWith('resign_')) {
        handleResign(ctx);
        ctx.answerCbQuery();
    }
    else if (data.startsWith('accept_')) {
        const sessionId = data.replace('accept_', '');
        const challenge = pendingChallenges.get(sessionId);
        if (!challenge) {
            ctx.answerCbQuery('Challenge not found');
            return;
        }
        if (!ctx.from)
            return;
        // Verify correct opponent (if username known)
        if (challenge.opponent.id && challenge.opponent.id !== ctx.from.id) {
            ctx.answerCbQuery('This challenge is not for you');
            return;
        }
        // Additional check for username if ID not set
        if (!challenge.opponent.id && challenge.opponent.username && challenge.opponent.username !== ctx.from.username) {
            ctx.answerCbQuery('This challenge is not for you');
            return;
        }
        challenge.opponent.id = ctx.from.id;
        challenge.opponent.username = ctx.from.username || challenge.opponent.username;
        (0, db_1.registerUser)(ctx.from.id, ctx.chat?.id || challenge.chatId, ctx.from.username);
        // Get the proper DM chat ID for the accepting user
        const acceptingUser = (0, db_1.getUser)(ctx.from.id);
        const acceptingUserDmChatId = acceptingUser?.dmChatId || 0;
        const gameSession = {
            id: sessionId,
            chatId: challenge.chatId,
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            mode: 'pvp',
            lastMoveAt: Date.now(),
            pgn: '',
            players: {
                w: challenge.challenger,
                b: {
                    id: challenge.opponent.id,
                    username: challenge.opponent.username,
                    dmChatId: acceptingUserDmChatId,
                    color: 'b'
                }
            }
        };
        games_1.games.set(sessionId, gameSession);
        (0, games_1.insertGame)(gameSession);
        pendingChallenges.delete(sessionId);
        const base = (0, ensureHttps_1.ensureHttps)(process.env.PUBLIC_URL || 'localhost:3000');
        const whiteUrl = `${base}/webapp/?session=${sessionId}&color=w`;
        const blackUrl = `${base}/webapp/?session=${sessionId}&color=b`;
        await ctx.editMessageText?.('Challenge accepted! Game starting...').catch(() => { });
        await ctx.telegram.sendMessage(challenge.chatId, `Game started between @${challenge.challenger.username} (White) and @${challenge.opponent.username} (Black). White to move`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '♟️ Play (White)', web_app: { url: whiteUrl } },
                        { text: '♟️ Play (Black)', web_app: { url: blackUrl } }
                    ],
                    [
                        { text: '📋 Show Board', callback_data: `show_board_${sessionId}` },
                        { text: '📜 Show Moves', callback_data: `show_moves_${sessionId}` }
                    ],
                    [
                        { text: '🏳️ Resign', callback_data: `resign_${sessionId}` }
                    ],
                    [
                        { text: 'ℹ️ How to Play', callback_data: `help_${sessionId}` }
                    ],
                    [
                        { text: '👀 Watch', callback_data: `spectate_${sessionId}` }
                    ]
                ]
            }
        });
        // Send DM to both players with their board links (only if they have DM capability)
        const boardText = (0, boardText_1.boardTextFromFEN)(gameSession.fen);
        // Send DM to challenger (white) if they have DM capability
        if (challenge.challenger.dmChatId && challenge.challenger.dmChatId > 0) {
            await ctx.telegram.sendMessage(challenge.challenger.dmChatId, `Game vs @${challenge.opponent.username} started. You are White.\n${boardText}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Open board', web_app: { url: whiteUrl } }]] } }).catch(() => { });
        }
        // Send DM to accepting player (black) if they have DM capability
        if (gameSession.players.b.dmChatId && gameSession.players.b.dmChatId > 0) {
            await ctx.telegram.sendMessage(gameSession.players.b.dmChatId, `Game vs @${challenge.challenger.username} started. You are Black.\n${boardText}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Open board', web_app: { url: blackUrl } }]] } }).catch(() => { });
        }
        ctx.answerCbQuery('Challenge accepted');
    }
    else if (data === 'solo_easy' || data === 'solo_med' || data === 'solo_hard') {
        const level = data === 'solo_easy' ? 2 : data === 'solo_med' ? 10 : 15;
        // Pass the selected level via ctx.state
        const state = ctx.state;
        state.soloLevel = level;
        try {
            await handleSoloGame(ctx);
        }
        catch (err) {
            const error = err;
            const stack = error.stack || error.message || String(error);
            log_1.log.error({ err: error }, 'Failed to start solo game');
            await ctx.reply(`❌ Error starting solo game:\n${stack}`);
        }
        delete state.soloLevel;
        ctx.answerCbQuery();
    }
    else if (data.startsWith('help_')) {
        ctx.answerCbQuery();
        ctx.reply('ℹ️ How to Play SPRESS Chess:\n\n' +
            '1. Tap "♟️ Launch SPRESS Board" to open the interactive board\n' +
            '2. Tap a piece to select it, then tap where you want to move\n' +
            '3. Or drag pieces directly to move them\n' +
            '4. The game updates in real-time for both players\n' +
            '5. Use /resign to give up the game\n\n' +
            'Good luck! ♟️');
    }
}
function handleStats(ctx) {
    if (!ctx.from)
        return;
    const s = (0, stats_1.getStats)(ctx.from.id);
    const lang = server_1.userPrefs[ctx.from.id]?.lang || 'en';
    const msg = `${(0, i18n_1.t)('statsHeader', { lng: lang })}\n` +
        `PvP - ${s.pvpWins}W/${s.pvpLosses}L/${s.pvpDraws}D\n` +
        `Solo - ${s.soloWins}W/${s.soloLosses}L/${s.soloDraws}D`;
    ctx.reply(msg);
}
function handleLeaderboard(ctx) {
    const chatId = ctx.chat.id;
    const all = Object.entries((0, stats_1.getAllStats)());
    const top = all
        .filter(([, s]) => stats_1.seenChats.has(chatId) && (s.chats || []).includes(chatId))
        .map(([idStr, s]) => ({ id: Number(idStr), rating: s.rating }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);
    if (top.length === 0)
        return ctx.reply('No games played yet');
    const lines = top.map((e, i) => {
        const user = (0, db_1.getUser)(e.id);
        const name = user?.username ? '@' + user.username : e.id.toString();
        return `${String(i + 1).padStart(2, ' ')}. ${name.padEnd(10)} ${e.rating}`;
    });
    const lang = server_1.userPrefs[ctx.from?.id || 0]?.lang || 'en';
    ctx.reply(`${(0, i18n_1.t)('leaderboard', { lng: lang })}\n<pre>${lines.join('\n')}</pre>`, { parse_mode: 'HTML' });
}
function registerSpectateHandler(bot) {
    bot.action(/^spectate_(.+)/, async (ctx) => {
        const id = ctx.match[1];
        const url = `${WEBAPP_URL}?id=${id}&spectator=1`;
        await ctx.answerCbQuery();
        await ctx.reply(`Watch live: ${url}`);
    });
}
// Export bot configuration function
function configureTelegramBot() { }
