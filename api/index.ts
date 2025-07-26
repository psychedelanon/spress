import type { VercelRequest, VercelResponse } from '@vercel/node';
import session from './session';
import move from './move';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { url = '' } = req;
  if (url.startsWith('/api/session')) return session(req, res);
  if (url.startsWith('/api/move')) return move(req, res);
  if (url.startsWith('/api/health') || url === '/health') {
    return res.json({ status: 'ok' });
  }
  return res.status(404).send('Not found');
}
