import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket(roomId: string) {
  const socketRef = useRef<Socket>();

  useEffect(() => {
    const socket = io('/', { query: { roomId } });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [roomId]);

  return socketRef;
}
export default useSocket;
