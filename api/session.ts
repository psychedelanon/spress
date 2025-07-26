import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeSessions } from '../src/store/sessions';
import { games } from '../src/store/games';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const telegramId = Number(req.query.telegramId);
  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
  const sessionId = activeSessions.get(telegramId);
  if (!sessionId) return res.status(404).end();
  const game = games.get(sessionId);
  if (!game) return res.status(404).end();
  const color = game.players.b.id === telegramId ? 'b' : 'w';
  res.json({ sessionId, color });
}
