import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.PUSHER_CLUSTER || '',
  useTLS: true
});

export function sendGameUpdate(sessionId: string, payload: any) {
  return pusher.trigger(`game-${sessionId}`, 'update', payload);
}

export function notifyGameStart(sessionId: string) {
  return pusher.trigger(`game-${sessionId}`, 'start', { sessionId });
}

export default pusher;
