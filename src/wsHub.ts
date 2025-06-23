import WebSocket from 'ws';
import { Chess } from 'chess.js';
import bestMove from './engine/stockfish';
import { getGame, updateGame, deleteGame, updateLastDm } from './store/db';
import { ensureHttps } from './utils/ensureHttps';

interface GameSession {
  game: Chess;
  clients: Set<WebSocket>;
  colors: Record<string, 'w' | 'b'>;
  mode?: 'ai' | 'human';
  lastDm: number;
}

const sessions = new Map<string, GameSession>();

// Import bot instance for sending DMs
let botInstance: any = null;
export function setBotInstance(bot: any) {
  botInstance = bot;
}

export function initWS(server: import('http').Server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const { searchParams } = new URL(req.url!, 'http://x');
    const id = searchParams.get('session')!;
    const color = searchParams.get('color') as 'w' | 'b';

    let session = sessions.get(id);
    if (!session) {
      // Try to load from database
      const row = getGame.get(id) as any;
      if (!row) {
        // If no session exists, create a demo session for testing
        console.log(`Session ${id} not found, creating demo session`);
        session = {
          game: new Chess(),
          clients: new Set(),
          colors: { 'demo_white': 'w', 'demo_black': 'b' },
          mode: 'human',
          lastDm: 0
        };
        sessions.set(id, session);
        console.log(`Created demo session ${id}`);
      } else {
        session = {
          game: new Chess(row.fen),
          clients: new Set(),
          colors: { [row.white_id]: 'w', [row.black_id]: 'b' },
          mode: row.mode || 'human',
          lastDm: row.last_dm || 0
        };
        sessions.set(id, session);
      }
    }

    session.clients.add(ws);
    console.log(`Player connected to session ${id} as ${color}`);

    // Send initial game state
    ws.send(JSON.stringify({
      type: 'update',
      fen: session.game.fen(),
      turn: session.game.turn(),
      winner: session.game.isGameOver() ? (session.game.turn() === 'w' ? 'black' : 'white') : null
    }));

    ws.on('message', async raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'move') return;

      const { game } = session!;
      
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

      console.log(`Move made: ${move.san} (${move.from}->${move.to})`);

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
      session!.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });

      // Check if game is over - cleanup if so
      if (game.isGameOver()) {
        console.log(`Game ${id} ended: ${game.isCheckmate() ? 'Checkmate' : game.isDraw() ? 'Draw' : 'Game over'}`);
        deleteGame.run(id);
        setTimeout(() => sessions.delete(id), 5000); // Small delay for final messages
        return;
      }

      // Send turn notification to opponent if they're offline
      await sendTurnNotification(session!, id);

      // If AI mode and game not over, make AI move
      if (session!.mode === 'ai' && !game.isGameOver() && game.turn() === 'b') {
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
              // Update database with AI move
              updateGame.run(game.fen(), game.pgn(), game.turn(), Date.now(), id);
              
              const aiPayload = {
                type: 'update',
                fen: game.fen(),
                san: aiMoveResult.san,
                turn: game.turn(),
                winner: game.isGameOver() ? (game.turn() === 'w' ? 'black' : 'white') : null
              };
              
              session!.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(aiPayload));
                }
              });

              // Check if AI move ended the game
              if (game.isGameOver()) {
                console.log(`AI ended game: ${game.isCheckmate() ? 'Checkmate' : 'Draw'}`);
                deleteGame.run(id);
                setTimeout(() => sessions.delete(id), 5000);
              }
            } else {
              console.error('AI move failed:', aiMove);
            }
          } catch (error) {
            console.error('AI move error:', error);
          }
        }, 800); // Slight delay for better UX
      }
    });

    ws.on('close', () => {
      session?.clients.delete(ws);
      if (session?.clients.size === 0) {
        // Clean up empty sessions after a delay
        setTimeout(() => {
          if (session?.clients.size === 0) {
            sessions.delete(id);
            console.log(`Cleaned up empty session ${id}`);
          }
        }, 30000);
      }
    });
  });

  return wss;
}

// Send turn notification to offline opponent
async function sendTurnNotification(session: GameSession, sessionId: string) {
  if (!botInstance) return;

  const { game, colors, lastDm, clients } = session;
  const currentTurn = game.turn();
  
  // Find opponent's Telegram ID
  const opponentId = Object.entries(colors)
    .find(([tgId, color]) => color === currentTurn)?.[0];
  
  if (!opponentId) return;

  // Debounce: only send if 30 seconds have passed and opponent is offline
  const debounceMs = 30_000;
  const isOpponentOffline = clients.size <= 1;
  
  if (Date.now() - lastDm > debounceMs && isOpponentOffline) {
    try {
      const base = ensureHttps(process.env.PUBLIC_URL || 'localhost:3000');
      const url = `${base}/webapp/?session=${sessionId}&color=${currentTurn}`;
      
      await botInstance.telegram.sendMessage(opponentId, '♟️ Your move', {
        reply_markup: {
          inline_keyboard: [[{
            text: 'Open board',
            web_app: { url }
          }]]
        }
      });
      
      session.lastDm = Date.now();
      updateLastDm.run(session.lastDm, sessionId);
    } catch (error) {
      console.error('Failed to send turn notification:', error);
    }
  }
} 