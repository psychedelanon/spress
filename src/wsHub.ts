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
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const id = url.searchParams.get('session');
    const color = url.searchParams.get('color') as 'w' | 'b' | null;
    
    if (!id) {
      ws.close(4000, 'Session ID required');
      return;
    }
    
    if (color !== 'w' && color !== 'b') {
      ws.close(4001, 'color required');
      return;
    }
    
    console.log(`Player connected to session ${id} as ${color}`);
    
    // Get or create session clients
    let sessionClients = sessions.get(id);
    if (!sessionClients) {
      sessionClients = { game: new Chess(), clients: new Set() };
      sessions.set(id, sessionClients);
    }
    
    // Store color assignment on the WebSocket
    (ws as any).playerColor = color;
    
    sessionClients.clients.add(ws);
    
    // Load game state from database if available
    const gameSession = games.get(id);
    if (gameSession) {
      // Sync in-memory chess with database FEN
      sessionClients.game.load(gameSession.fen);
    }
    
    // >>> immediate position snapshot <<<
    const payload = JSON.stringify({
      type: 'update',
      fen: sessionClients.game.fen(),
      turn: sessionClients.game.turn(),
      winner: sessionClients.game.isGameOver() ? 
        (sessionClients.game.turn() === 'w' ? 'black' : 'white') : null
    });
    ws.send(payload);
    console.log(`➡️ sent FEN to ${color} for session ${id}`);

    ws.on('message', async raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'move') return;

      const { game } = sessionClients!;
      const gameSession = games.get(id);
      if (!gameSession) return;
      
      // Parse move - normalize UCI format (e2e4, e7e8q, etc.)
      let move;
      try {
        const { move: rawMove } = msg;
        
        /** 1️⃣ Normalize move format ******************************************/
        // Allow "e2e4", "e2->e4", "e2 e4", etc.
        const trimmed = rawMove.replace(/[^a-h1-8qrbn]/gi, '');
        // Allow optional promotion letter at the very end
        const uciMatch = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(trimmed);
        if (!uciMatch) throw new Error('Invalid move format: ' + rawMove);
        const [, uFrom, uTo, promo] = uciMatch;

        /** 2️⃣ Try move in chess.js ****************************************/
        move = game.move({
          from: uFrom,
          to: uTo,
          promotion: (promo as any) || 'q',
        });
        
        if (!move) throw new Error('Illegal move');
      } catch (error) {
        console.error('Move parsing error:', error);
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
            
            // Parse AI move (should be in UCI format)
            const aiTrimmed = aiMove.replace(/[^a-h1-8qrbn]/gi, '');
            const aiUciMatch = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(aiTrimmed);
            
            let aiMoveResult;
            if (aiUciMatch) {
              const [, aiFrom, aiTo, aiPromo] = aiUciMatch;
              aiMoveResult = game.move({
                from: aiFrom,
                to: aiTo,
                promotion: (aiPromo as any) || 'q'
              });
            } else {
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