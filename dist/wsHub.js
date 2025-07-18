"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBotInstance = setBotInstance;
exports.sendTurnNotification = sendTurnNotification;
exports.initWS = initWS;
const ws_1 = __importDefault(require("ws"));
const chess_js_1 = require("chess.js");
const stockfish_1 = __importDefault(require("./engine/stockfish"));
const games_1 = require("./store/games");
const ensureHttps_1 = require("./utils/ensureHttps");
const boardText_1 = require("./utils/boardText");
const stats_1 = require("./store/stats");
const sessions = new Map();
// Import bot instance for sending notifications
let botInstance = null;
function setBotInstance(bot) {
    botInstance = bot;
}
/**
 * Robust turn notification that prevents 400 Bad Request errors
 */
async function sendTurnNotification(gameSession, captureInfo) {
    if (!botInstance) {
        console.warn('Bot instance not available for notifications');
        return;
    }
    const turnColor = gameSession.fen.split(' ')[1];
    const player = gameSession.players[turnColor];
    // Skip DM notifications for AI players
    if (player.isAI) {
        console.log('Skipping notification for AI player');
        return;
    }
    // Build web-app URL
    const params = new URLSearchParams({
        session: gameSession.id,
        color: turnColor,
    });
    const base = (0, ensureHttps_1.ensureHttps)(process.env.PUBLIC_URL || 'localhost:3000');
    const boardUrl = `${base}/webapp/?${params.toString()}`;
    // Message text with optional capture info
    const mention = player.username ? `@${player.username}` : 'Your';
    const captureText = captureInfo ? `   |   💥 ${captureInfo} captured!` : '';
    const text = `♟️ ${mention} move${captureText}`;
    // Inline "Open board" button
    const markup = {
        inline_keyboard: [
            [{ text: 'Open board', web_app: { url: boardUrl } }]
        ]
    };
    console.log(`Sending turn notification: ${text} for game ${gameSession.id}`);
    // 1) Always notify the *origin chat* where game was created
    try {
        await botInstance.telegram.sendMessage(gameSession.chatId, text, {
            reply_markup: markup
        });
        console.log(`✅ Notified origin chat ${gameSession.chatId}`);
    }
    catch (err) {
        console.error('Failed to notify origin chat:', err?.message || err);
    }
    // 2) Optional personal DM (only if we stored dmChatId and it's different from origin and is a valid private chat)
    if (player.dmChatId && player.dmChatId > 0 && player.dmChatId !== gameSession.chatId) {
        try {
            const boardText = (0, boardText_1.boardTextFromFEN)(gameSession.fen);
            await botInstance.telegram.sendMessage(player.dmChatId, `${text}\n${boardText}`, {
                parse_mode: 'Markdown',
                reply_markup: markup
            });
            console.log(`✅ Sent DM to user ${player.id}`);
        }
        catch (err) {
            // Ignore 400 here – user might have blocked bot, etc.
            const errObj = err;
            const errMsg = errObj.description || errObj.message;
            if (errObj.description?.includes('chat not found')) {
                console.warn(`DM to user ${player.id} failed – they never started the bot`);
            }
            else {
                console.error('Failed to DM user:', errMsg);
            }
        }
    }
}
function initWS(server) {
    const wss = new ws_1.default.Server({ server, path: '/ws' });
    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const id = url.searchParams.get('session');
        const color = url.searchParams.get('color');
        if (!id) {
            ws.close(4000, 'Session ID required');
            return;
        }
        if (color !== 'w' && color !== 'b') {
            ws.close(4001, 'color required');
            return;
        }
        console.log(`Player connected to session ${id} as ${color}`);
        // Check if this is a valid active session
        const gameSession = games_1.games.get(id);
        // If no game session exists, this is likely a stale/expired session
        if (!gameSession) {
            // Reduced logging for expired sessions to prevent spam
            if (Math.random() < 0.1) { // Only log 10% of expired session attempts
                console.log(`Rejecting connection to expired/invalid session: ${id}`);
            }
            ws.send(JSON.stringify({
                type: 'session_expired',
                error: 'This game session has expired. Please start a new game.'
            }));
            ws.close(4002, 'Session expired');
            return;
        }
        // Get or create session clients
        let sessionClients = sessions.get(id);
        if (!sessionClients) {
            console.log(`🐛 Creating new Chess instance for session ${id}`);
            const chessInstance = new chess_js_1.Chess();
            console.log(`🐛 Fresh Chess instance FEN: "${chessInstance.fen()}"`);
            sessionClients = { game: chessInstance, clients: new Set() };
            sessions.set(id, sessionClients);
        }
        // Store color assignment on the WebSocket
        const socket = ws;
        socket.playerColor = color;
        sessionClients.clients.add(ws);
        // Load game state from database (we know gameSession exists now)
        console.log(`🐛 Loading game state for session ${id}:`);
        console.log(`🐛 Database FEN: "${gameSession.fen}"`);
        console.log(`🐛 FEN length: ${gameSession.fen.length}`);
        try {
            sessionClients.game.load(gameSession.fen);
            console.log(`🐛 Chess.js loaded successfully`);
            console.log(`🐛 Chess.js FEN after load: "${sessionClients.game.fen()}"`);
        }
        catch (err) {
            console.error(`Failed to load FEN for session ${id}:`, gameSession.fen, err);
            ws.send(JSON.stringify({
                type: 'session_corrupted',
                error: 'Game state corrupted. Please start a new game.'
            }));
            ws.close(4003, 'Corrupted game state');
            return;
        }
        // >>> immediate position snapshot <<<
        const isGameOver = sessionClients.game.isGameOver();
        const payload = JSON.stringify({
            type: 'update',
            fen: sessionClients.game.fen(),
            turn: sessionClients.game.turn(),
            winner: isGameOver ?
                (sessionClients.game.isDraw() ? null : (sessionClients.game.turn() === 'w' ? 'black' : 'white')) : null,
            isDraw: isGameOver && sessionClients.game.isDraw(),
            isCheckmate: isGameOver && sessionClients.game.isCheckmate(),
            isInCheck: sessionClients.game.inCheck()
        });
        ws.send(payload);
        console.log(`➡️ sent FEN to ${color} for session ${id}`);
        ws.on('message', async (raw) => {
            const msg = JSON.parse(raw.toString());
            // Handle keepalive pings
            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
            }
            if (msg.type !== 'move')
                return;
            const { game } = sessionClients;
            const gameSession = games_1.games.get(id);
            if (!gameSession) {
                ws.send(JSON.stringify({
                    type: 'invalid',
                    error: 'Game session not found'
                }));
                return;
            }
            // Guard: prevent moves if game is already over
            if (game.isGameOver()) {
                console.log(`Move rejected: game ${id} is already over`);
                ws.send(JSON.stringify({
                    type: 'invalid',
                    error: 'Game is already over'
                }));
                return;
            }
            // Validate it's the correct player's turn
            const currentTurn = game.turn();
            const playerColor = ws.playerColor;
            if (currentTurn !== playerColor) {
                console.log(`Invalid move attempt: ${playerColor} tried to move on ${currentTurn}'s turn`);
                ws.send(JSON.stringify({
                    type: 'invalid',
                    error: 'Not your turn'
                }));
                return;
            }
            // Parse move - normalize UCI format (e2e4, e7e8q, etc.)
            let move;
            try {
                const { move: rawMove } = msg;
                /** 1️⃣ Normalize move format ******************************************/
                // Allow "e2e4", "e2->e4", "e2 e4", etc.
                const trimmed = rawMove.replace(/[^a-h1-8qrbn]/gi, '');
                // Allow optional promotion letter at the very end
                const uciMatch = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(trimmed);
                if (!uciMatch)
                    throw new Error('Invalid move format: ' + rawMove);
                const [, uFrom, uTo, promo] = uciMatch;
                /** 2️⃣ Try move in chess.js ****************************************/
                move = game.move({
                    from: uFrom,
                    to: uTo,
                    promotion: promo || 'q',
                });
                if (!move)
                    throw new Error('Illegal move');
            }
            catch (error) {
                console.error('Move parsing error:', error);
                // Send invalid move response to client
                ws.send(JSON.stringify({
                    type: 'invalid',
                    error: error instanceof Error ? error.message : 'Invalid move'
                }));
                return;
            }
            console.log(`Move made in ${id}: ${move.san} (${move.from}->${move.to})`);
            // Extract capture info from the move or message
            const captureInfo = move.captured ? `${move.captured}` : (msg.captured || null);
            // Update game session
            gameSession.fen = game.fen();
            gameSession.pgn = game.pgn();
            gameSession.lastMoveAt = Date.now();
            // Update database with new position
            (0, games_1.updateGame)(game.fen(), game.pgn(), game.turn(), Date.now(), id);
            const isGameOver = game.isGameOver();
            const payload = {
                type: 'update',
                fen: game.fen(),
                san: move.san,
                turn: game.turn(),
                winner: isGameOver ? (game.isDraw() ? null : (game.turn() === 'w' ? 'black' : 'white')) : null,
                isDraw: isGameOver ? game.isDraw() : false,
                isCheckmate: isGameOver ? game.isCheckmate() : false,
                isInCheck: game.inCheck(),
                captured: captureInfo,
                captureSquare: msg.captureSquare || null
            };
            // Broadcast to all clients in this session
            sessionClients.clients.forEach(client => {
                if (client.readyState === ws_1.default.OPEN) {
                    client.send(JSON.stringify(payload));
                }
            });
            // Check if game is over - cleanup if so
            if (game.isGameOver()) {
                console.log(`Game ${id} ended: ${game.isCheckmate() ? 'Checkmate' : game.isDraw() ? 'Draw' : 'Game over'}`);
                // Only set winner if not a draw
                let result = 'draw';
                if (!game.isDraw()) {
                    gameSession.winner = game.turn() === 'w' ? 'black' : 'white';
                    result = gameSession.winner;
                }
                else {
                    gameSession.winner = null;
                }
                (0, stats_1.recordResult)(gameSession.players.w.id, gameSession.players.b.id, result, gameSession.mode, gameSession.chatId);
                if (process.env.ENABLE_SHARE_HOOK === '1') {
                    const botUsername = process.env.BOT_USERNAME || 'spressbot';
                    const txt = `I just won on SPRESS! ♟️ t.me/${botUsername}?startgroup`;
                    try {
                        await botInstance.telegram.sendMessage(gameSession.chatId, txt, {
                            reply_markup: { inline_keyboard: [[{ text: 'Share', switch_inline_query: txt }]] }
                        });
                    }
                    catch (err) {
                        console.error('Failed to send share message', err);
                    }
                }
                try {
                    const url = `${(0, ensureHttps_1.ensureHttps)(process.env.PUBLIC_URL || 'localhost:3000')}/webapp/?replay=${Buffer.from(game.pgn()).toString('base64')}`;
                    await botInstance.telegram.sendMessage(gameSession.chatId, 'Game over', {
                        reply_markup: { inline_keyboard: [[{ text: '▶️ Replay', url }]] }
                    });
                }
                catch (err) {
                    console.error('Failed to send replay link', err);
                }
                (0, games_1.deleteGame)(id);
                setTimeout(() => {
                    sessions.delete(id);
                    games_1.games.delete(id);
                }, 5000);
                return;
            }
            // Send turn notification using the robust function
            await sendTurnNotification(gameSession, captureInfo);
            // If AI mode and game not over, make AI move
            if (gameSession.mode === 'ai' && !game.isGameOver() && game.turn() === 'b') {
                console.log('AI turn - calculating move...');
                setTimeout(async () => {
                    try {
                        const level = gameSession.aiLevel || 10;
                        const depth = Math.max(2, Math.floor(level / 3));
                        const aiMove = await (0, stockfish_1.default)(game.fen(), depth);
                        console.log(`AI attempting move: ${aiMove}`);
                        // Parse AI move (should be in UCI format)
                        const aiTrimmed = aiMove.replace(/[^a-h1-8qrbn]/gi, '');
                        const aiUciMatch = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(aiTrimmed);
                        let aiMoveResult;
                        if (aiUciMatch) {
                            const [, aiFrom, aiTo, aiPromo] = aiUciMatch;
                            aiMoveResult = game.move({
                                from: aiFrom,
                                to: aiTo,
                                promotion: aiPromo || 'q'
                            });
                        }
                        else {
                            // Fallback: try as algebraic notation
                            aiMoveResult = game.move(aiMove);
                        }
                        if (aiMoveResult) {
                            console.log(`AI move successful: ${aiMoveResult.san}`);
                            // Update game session
                            gameSession.fen = game.fen();
                            gameSession.pgn = game.pgn();
                            gameSession.lastMoveAt = Date.now();
                            // Update database with AI move
                            (0, games_1.updateGame)(game.fen(), game.pgn(), game.turn(), Date.now(), id);
                            const aiGameOver = game.isGameOver();
                            const aiPayload = {
                                type: 'update',
                                fen: game.fen(),
                                san: aiMoveResult.san,
                                turn: game.turn(),
                                winner: aiGameOver ? (game.isDraw() ? null : (game.turn() === 'w' ? 'black' : 'white')) : null,
                                isDraw: aiGameOver ? game.isDraw() : false,
                                isCheckmate: aiGameOver ? game.isCheckmate() : false,
                                isInCheck: game.inCheck(),
                                captured: aiMoveResult.captured ? `${aiMoveResult.captured}` : null,
                                captureSquare: aiMoveResult.captured ? aiMoveResult.to : null
                            };
                            sessionClients.clients.forEach(client => {
                                if (client.readyState === ws_1.default.OPEN) {
                                    client.send(JSON.stringify(aiPayload));
                                }
                            });
                            // Check if AI move ended the game
                            if (game.isGameOver()) {
                                console.log(`AI ended game: ${game.isCheckmate() ? 'Checkmate' : 'Draw'}`);
                                // Only set winner if not a draw
                                if (!game.isDraw()) {
                                    gameSession.winner = game.turn() === 'w' ? 'black' : 'white';
                                }
                                else {
                                    gameSession.winner = null;
                                }
                                (0, games_1.deleteGame)(id);
                                setTimeout(() => {
                                    sessions.delete(id);
                                    games_1.games.delete(id);
                                }, 5000);
                            }
                            else {
                                // Send notification for human player's turn (include AI capture info if any)
                                const aiCaptureInfo = aiMoveResult.captured ? `${aiMoveResult.captured}` : undefined;
                                await sendTurnNotification(gameSession, aiCaptureInfo);
                            }
                        }
                        else {
                            console.error('AI move failed:', aiMove);
                        }
                    }
                    catch (error) {
                        console.error('AI move error:', error);
                    }
                }, 800);
            }
        });
        ws.on('close', () => {
            sessionClients?.clients.delete(ws);
            if (sessionClients?.clients.size === 0) {
                // Clean up empty sessions immediately for expired games, 
                // or after a delay for active games
                const gameSession = games_1.games.get(id);
                const isExpiredGame = !gameSession;
                setTimeout(() => {
                    if (sessionClients?.clients.size === 0) {
                        sessions.delete(id);
                        console.log(`Cleaned up ${isExpiredGame ? 'expired' : 'empty'} session ${id}`);
                    }
                }, isExpiredGame ? 1000 : 30000); // Quick cleanup for expired games
            }
        });
    });
    return wss;
}
