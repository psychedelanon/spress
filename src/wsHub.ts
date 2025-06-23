import WebSocket from 'ws';
import { Chess } from 'chess.js';
import bestMove from './engine/stockfish';
import { getGame, updateGame, deleteGame, updateLastDm, games } from './store/db';
import { ensureHttps } from './utils/ensureHttps';
import { GameSession } from './types';

interface SessionClients {
  clients: Set<WebSocket>;
  game: Chess;
}

const sessions = new Map<string, SessionClients>();

// Import bot instance for sending notifications
let botInstance: any = null;
export function setBotInstance(bot: any) {
  botInstance = bot;
}

/**
 * Robust turn notification that prevents 400 Bad Request errors
 */
export async function sendTurnNotification(gameSession: GameSession) {
  if (!botInstance) {
    console.warn('Bot instance not available for notifications');
    return;
  }

  const turnColor: 'w' | 'b' = gameSession.fen.split(' ')[1] as 'w' | 'b';
  const player = gameSession.players[turnColor];
  const otherPlayer = gameSession.players[turnColor === 'w' ? 'b' : 'w'];

  // Build web-app URL
  const params = new URLSearchParams({
    session: gameSession.id,
    color: turnColor,
  });
  const base = ensureHttps(process.env.PUBLIC_URL || 'localhost:3000');
  const boardUrl = `${base}/webapp/?${params.toString()}`;

  // Message text
  const mention = player.username ? `@${player.username}` : 'Your';
  const text = `♟️ ${mention} move`;

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
  } catch (err: any) {
    console.error('Failed to notify origin chat:', err?.description || err);
  }

  // 2) Optional personal DM (only if we stored dmChatId and it's different from origin)
  if (player.dmChatId && player.dmChatId !== gameSession.chatId) {
    try {
      await botInstance.telegram.sendMessage(player.dmChatId, text, { 
        reply_markup: markup 
      });
      console.log(`✅ Sent DM to user ${player.id}`);
    } catch (err: any) {
      // Ignore 400 here – user might have blocked bot, etc.
      if (err?.description?.includes('chat not found')) {
        console.warn(`DM to user ${player.id} failed – they never started the bot`);
      } else {
        console.error('Failed to DM user:', err?.description || err);
      }
    }
  }
}

export function initWS(server: import('http').Server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const { searchParams } = new URL(req.url!, 'http://x');
    const id = searchParams.get('session')!;
    const color = searchParams.get('color') as 'w' | 'b';

    let sessionClients = sessions.get(id);
    if (!sessionClients) {
      // Try to load game from database/memory
      const gameSession = games.get(id);
      if (!gameSession) {
        // If no session exists, create a demo session for testing
        console.log(`Session ${id} not found, creating demo session`);
        const demoGame: GameSession = {
          id,
          chatId: 0, // Demo chat ID
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          mode: 'pvp',
          lastMoveAt: Date.now(),
          pgn: '',
          players: {
            w: { id: 1, username: 'demo_white', color: 'w' },
            b: { id: 2, username: 'demo_black', color: 'b' }
          }
        };
        games.set(id, demoGame);
        
        sessionClients = {
          clients: new Set(),
          game: new Chess()
        };
        sessions.set(id, sessionClients);
        console.log(`Created demo session ${id}`);
      } else {
        sessionClients = {
          clients: new Set(),
          game: new Chess(gameSession.fen)
        };
        sessions.set(id, sessionClients);
        console.log(`Loaded existing session ${id}`);
      }
    }

    sessionClients.clients.add(ws);
    console.log(`Player connected to session ${id} as ${color}`);

    // Send initial game state
    const gameSession = games.get(id);
    if (gameSession) {
      ws.send(JSON.stringify({
        type: 'update',
        fen: gameSession.fen,
        turn: sessionClients.game.turn(),
        winner: sessionClients.game.isGameOver() ? 
          (sessionClients.game.turn() === 'w' ? 'black' : 'white') : null
      }));
    }

    ws.on('message', async raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'move') return;

      const { game } = sessionClients!;
      const gameSession = games.get(id);
      if (!gameSession) return;
      
      // Parse move - handle both algebraic notation and from-to format
      let move;
      try {
        if (msg.move.length === 4 && /^[a-h][1-8][a-h][1-8]$/.test(msg.move)) {
          // From-to format like "e2e4"
          move = game.move({
            from: msg.move.slice(0, 2),
            to: msg.move.slice(2, 4),
            promotion: 'q' // Auto-promote to queen
          });
        } else {
          // Try algebraic notation like "e4" or "Nf3"
          move = game.move(msg.move);
        }
      } catch (error) {
        console.error('Invalid move format:', msg.move);
        return;
      }
      
      if (!move) {
        console.log('Illegal move attempted:', msg.move);
        return;
      }

      console.log(`Move made in ${id}: ${move.san} (${move.from}->${move.to})`);

      // Update game session
      gameSession.fen = game.fen();
      gameSession.pgn = game.pgn();
      gameSession.lastMoveAt = Date.now();

      // Update database with new position
      updateGame.run(game.fen(), game.pgn(), game.turn(), Date.now(), id);

      const payload = {
        type: 'update',
        fen: game.fen(),
        san: move.san,
        turn: game.turn(),
        winner: game.isGameOver() ? (game.turn() === 'w' ? 'black' : 'white') : null
      };

      // Broadcast to all clients in this session
      sessionClients!.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });

      // Check if game is over - cleanup if so
      if (game.isGameOver()) {
        console.log(`Game ${id} ended: ${game.isCheckmate() ? 'Checkmate' : game.isDraw() ? 'Draw' : 'Game over'}`);
        gameSession.winner = game.turn() === 'w' ? 'black' : 'white';
        deleteGame.run(id);
        setTimeout(() => {
          sessions.delete(id);
          games.delete(id);
        }, 5000);
        return;
      }

      // Send turn notification using the robust function
      await sendTurnNotification(gameSession);

      // If AI mode and game not over, make AI move
      if (gameSession.mode === 'ai' && !game.isGameOver() && game.turn() === 'b') {
        console.log('AI turn - calculating move...');
        setTimeout(async () => {
          try {
            const aiMove = await bestMove(game.fen());
            console.log(`AI attempting move: ${aiMove}`);
            
            // Parse AI move (should be in from-to format)
            let aiMoveResult;
            if (aiMove.length === 4 && /^[a-h][1-8][a-h][1-8]$/.test(aiMove)) {
              aiMoveResult = game.move({
                from: aiMove.slice(0, 2),
                to: aiMove.slice(2, 4),
                promotion: 'q'
              });
            } else {
              // Try as algebraic notation
              aiMoveResult = game.move(aiMove);
            }
            
            if (aiMoveResult) {
              console.log(`AI move successful: ${aiMoveResult.san}`);
              
              // Update game session
              gameSession.fen = game.fen();
              gameSession.pgn = game.pgn();
              gameSession.lastMoveAt = Date.now();
              
              // Update database with AI move
              updateGame.run(game.fen(), game.pgn(), game.turn(), Date.now(), id);
              
              const aiPayload = {
                type: 'update',
                fen: game.fen(),
                san: aiMoveResult.san,
                turn: game.turn(),
                winner: game.isGameOver() ? (game.turn() === 'w' ? 'black' : 'white') : null
              };
              
              sessionClients!.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(aiPayload));
                }
              });

              // Check if AI move ended the game
              if (game.isGameOver()) {
                console.log(`AI ended game: ${game.isCheckmate() ? 'Checkmate' : 'Draw'}`);
                gameSession.winner = game.turn() === 'w' ? 'black' : 'white';
                deleteGame.run(id);
                setTimeout(() => {
                  sessions.delete(id);
                  games.delete(id);
                }, 5000);
              } else {
                // Send notification for human player's turn
                await sendTurnNotification(gameSession);
              }
            } else {
              console.error('AI move failed:', aiMove);
            }
          } catch (error) {
            console.error('AI move error:', error);
          }
        }, 800);
      }
    });

    ws.on('close', () => {
      sessionClients?.clients.delete(ws);
      if (sessionClients?.clients.size === 0) {
        // Clean up empty sessions after a delay
        setTimeout(() => {
          if (sessionClients?.clients.size === 0) {
            sessions.delete(id);
            console.log(`Cleaned up empty session ${id}`);
          }
        }, 30000);
      }
    });
  });

  return wss;
} 