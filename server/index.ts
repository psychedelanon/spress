import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { randomBytes } from 'crypto';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);
const pub = new Redis(redisUrl);
const sub = pub.duplicate();

const app = express();
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
io.adapter(createAdapter(pub, sub));

const ROOM_TTL = 60 * 60 * 2; // 2h

function makeId() {
  return randomBytes(4).toString('hex');
}

app.post('/create', async (_req, res) => {
  const roomId = makeId();
  await redis.set(`room:${roomId}`, JSON.stringify({ fen: 'start', players: [] }), 'EX', ROOM_TTL);
  res.json({ roomId });
});

app.post('/join', async (req, res) => {
  const { roomId, tgUser } = req.body || {};
  if (!roomId || !tgUser) return res.status(400).send('invalid');
  io.to(roomId).emit('playerJoined', tgUser);
  res.json({ roomId, tgUser });
});

io.on('connection', (socket) => {
  const { roomId } = socket.handshake.query;
  if (typeof roomId === 'string') socket.join(roomId);

  socket.on('move', async (data) => {
    io.to(data.roomId).emit('move', data);
    if (data.fen) {
      await redis.set(`room:${data.roomId}`, JSON.stringify({ fen: data.fen }), 'EX', ROOM_TTL);
    }
  });
});

export function start(port: number) {
  httpServer.listen(port, () => console.log(`\u{1F680} server on ${port}`));
}

if (require.main === module) {
  start(Number(process.env.PORT) || 3000);
}
