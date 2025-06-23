import { useEffect, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import WebApp from '@twa-dev/sdk';
import ReconnectingWebSocket from 'reconnecting-websocket';
import './App.css';

function App() {
  const [fen, setFen] = useState('start');
  const [sessionId, setSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [ws, setWs] = useState<ReconnectingWebSocket | null>(null);

  useEffect(() => {
    // Initialize Telegram WebApp
    WebApp.ready();
    WebApp.expand();

    // Get session ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = urlParams.get('sessionId') || `session_${Date.now()}`;
    setSessionId(sessionIdFromUrl);

    // Create WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionIdFromUrl}`;
    
    const websocket = new ReconnectingWebSocket(wsUrl);
    
    websocket.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.fen) {
        setFen(data.fen);
      }
    };

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setLoading(false);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
    const move = sourceSquare + targetSquare;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'move', 
        move: move,
        sessionId: sessionId
      }));
      return true;
    }
    return false;
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: 'var(--tg-bg-color, #ffffff)',
        color: 'var(--tg-text-color, #000000)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div>Loading TeleChess...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '10px',
      backgroundColor: 'var(--tg-bg-color, #ffffff)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <Chessboard 
        position={fen} 
        onPieceDrop={onPieceDrop}
        boardWidth={Math.min(WebApp.viewportHeight - 70, 380)} 
      />
    </div>
  );
}

export default App;
