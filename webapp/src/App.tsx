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
    isGameOver: boolean;
    winner: string | null;
    isDraw: boolean;
    isCheckmate: boolean;
  } | null>(null);

  // Generate game outcome message
  const getGameOutcomeMessage = () => {
    if (!gameState?.isGameOver) return null;
    
    if (gameState.isDraw) {
      return 'Draw';
    } else if (gameState.isCheckmate && gameState.winner) {
      return `Checkmate – ${gameState.winner === 'white' ? 'White' : 'Black'} wins`;
    } else if (gameState.winner) {
      return `${gameState.winner === 'white' ? 'White' : 'Black'} wins`;
    }
    
    return 'Game Over';
  };

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
        const isGameOver = msg.winner !== null || msg.isDraw || false;
        setGameState({
          fen: msg.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          color,
          session,
          turn: msg.fen?.split(' ')[1] || 'w',
          status: isGameOver ? 
            (msg.isDraw ? 'Draw' : `Game Over - ${msg.winner} wins!`) : 
            'Playing',
          isGameOver,
          winner: msg.winner,
          isDraw: msg.isDraw || false,
          isCheckmate: msg.isCheckmate || false
        });
      } else if (msg.type === 'update') {
        setGameState(prev => {
          const isGameOver = msg.winner !== null || msg.isDraw || false;
          const winner = msg.winner;
          const isDraw = msg.isDraw || false;
          const isCheckmate = msg.isCheckmate || false;
          
          let status = 'Playing';
          if (isGameOver) {
            if (isDraw) {
              status = 'Draw';
            } else if (winner) {
              status = `Game Over - ${winner} wins!`;
            } else {
              status = 'Game Over';
            }
          }
          
          // Create initial game state if this is the first message
          if (!prev) {
            return {
              fen: msg.fen,
              color,
              session,
              turn: msg.turn,
              status,
              isGameOver,
              winner,
              isDraw,
              isCheckmate
            };
          } else {
            return {
              ...prev,
              fen: msg.fen,
              turn: msg.turn,
              status,
              isGameOver,
              winner,
              isDraw,
              isCheckmate
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
      <div className="header-section">
        <h1 className="main-title">SPROTO CHESS</h1>
        <div className="subtitle-effect">spress</div>
      </div>
      
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
      
      <div className="game-board-section">
        {/* Top-left overlay area */}
        <div className="board-overlay top-left">
          {/* Future overlay content goes here */}
          <div className="overlay-placeholder"></div>
        </div>
        
        <div className={`board-wrapper ${gameState.isCheckmate ? 'checkmate' : ''}`}>
          <Board 
            socket={socket} 
            color={gameState.color} 
            initialFen={gameState.fen} 
          />
        </div>
      </div>
      
      <div className="instructions">
        {gameState.isGameOver ? 
          'Game finished' :
          (gameState.turn === gameState.color ? 
            'Your turn - drag pieces to move!' : 
            'Waiting for opponent...'
          )
        }
      </div>

      {/* Game Outcome Overlay */}
      {gameState.isGameOver && (
        <div className="game-over-overlay">
          <div className="game-outcome-message">
            {getGameOutcomeMessage()}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
