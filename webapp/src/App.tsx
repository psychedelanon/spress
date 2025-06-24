import { useEffect, useState } from 'react';
import Board from './Board';
import './App.css';

function App() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<{
    fen: string;
    color: 'w' | 'b';
    session: string;
    turn: 'w' | 'b';
    status: string;
  } | null>(null);

  useEffect(() => {
    // Get URL parameters
    const url = new URL(window.location.href);
    const session = url.searchParams.get('session');
    const color = (url.searchParams.get('color') ?? 'w') as 'w' | 'b';
    
    if (!session) {
      console.error('No session ID provided');
      return;
    }

    // Create WebSocket connection
    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${wsProtocol}://${location.host}/ws?session=${session}&color=${color}`);
    
    ws.onopen = () => {
      console.log('🔌 WebSocket connected');
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log('WebSocket message:', msg);
      
      if (msg.type === 'init') {
        setGameState({
          fen: msg.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          color,
          session,
          turn: msg.fen?.split(' ')[1] || 'w',
          status: 'Playing'
        });
      } else if (msg.type === 'update') {
        setGameState(prev => {
          // Create initial game state if this is the first message
          if (!prev) {
            return {
              fen: msg.fen,
              color,
              session,
              turn: msg.turn,
              status: msg.winner ? `Game Over - ${msg.winner} wins!` : 'Playing'
            };
          } else {
            return {
              ...prev,
              fen: msg.fen,
              turn: msg.turn,
              status: msg.winner ? `Game Over - ${msg.winner} wins!` : 'Playing'
            };
          }
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setSocket(null);
    };

    return () => {
      ws.close();
    };
  }, []);

  if (!socket || !gameState) {
    return (
      <div className="app-container">
        <h1 className="title">SPRESS Chess</h1>
        <div className="loading">Connecting to game...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1 className="title">SPRESS Chess</h1>
      <div className="game-info">
        <div className="player-info">
          Playing as: <strong>{gameState.color === 'w' ? 'White' : 'Black'}</strong>
        </div>
        <div className="turn-info">
          Turn: <strong>{gameState.turn === 'w' ? 'White' : 'Black'}</strong>
        </div>
        <div className="status-info">
          Status: <strong>{gameState.status}</strong>
        </div>
      </div>
      
      <Board 
        socket={socket} 
        color={gameState.color} 
        initialFen={gameState.fen} 
      />
      
      <div className="instructions">
        {gameState.turn === gameState.color ? 
          'Your turn - drag pieces to move!' : 
          'Waiting for opponent...'
        }
      </div>
    </div>
  );
}

export default App;
