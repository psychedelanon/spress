import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Chess } from 'chess.js';
import { games, updateGame, deleteGame } from '../src/store/games';
import { activeSessions } from '../src/store/sessions';
import { sendGameUpdate } from '../src/pusherHub';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { session, color, move, captured, captureSquare } = req.body || {};
  if (!session || !color || !move) return res.status(400).json({ error: 'invalid data' });

  const gameSession = games.get(session);
  if (!gameSession) return res.status(404).json({ error: 'session not found' });

  const chess = new Chess(gameSession.fen);
  if (chess.turn() !== color) return res.status(400).json({ error: 'not your turn' });

  const uci = move.replace(/[^a-h1-8qrbn]/gi, '');
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(uci);
  if (!match) return res.status(400).json({ error: 'invalid move' });
  const [, from, to, promo] = match;
  const result = chess.move({ from, to, promotion: (promo as any) || 'q' });
  if (!result) return res.status(400).json({ error: 'illegal move' });

  gameSession.fen = chess.fen();
  gameSession.pgn = chess.pgn();
  gameSession.lastMoveAt = Date.now();
  updateGame(gameSession.fen, gameSession.pgn || '', chess.turn(), Date.now(), session);

  const payload = {
    fen: chess.fen(),
    san: result.san,
    turn: chess.turn(),
    captured: result.captured ? `${result.captured}` : captured || null,
    captureSquare: captureSquare || (result.captured ? result.to : null),
    winner: chess.isGameOver() ? (chess.isDraw() ? null : (chess.turn() === 'w' ? 'black' : 'white')) : null,
    isDraw: chess.isDraw(),
    isCheckmate: chess.isCheckmate(),
    isInCheck: chess.inCheck()
  };

  await sendGameUpdate(session, payload);

  if (chess.isGameOver()) {
    deleteGame(session);
    activeSessions.delete(gameSession.players.w.id);
    activeSessions.delete(gameSession.players.b.id);
  }

  res.json({ ok: true });
}
