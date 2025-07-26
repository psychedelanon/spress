import Pusher from 'pusher-js';

const key = import.meta.env.VITE_PUSHER_KEY as string;
const cluster = import.meta.env.VITE_PUSHER_CLUSTER as string;

export function subscribeToGame(sessionId: string, callback: (data: any) => void) {
  const pusher = new Pusher(key, { cluster });
  const channel = pusher.subscribe(`game-${sessionId}`);
  channel.bind('update', callback);
  return () => {
    channel.unbind('update', callback);
    pusher.unsubscribe(`game-${sessionId}`);
    pusher.disconnect();
  };
}
