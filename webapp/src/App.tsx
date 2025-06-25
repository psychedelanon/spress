import { useEffect, useState, useRef } from 'react';
import Board from './Board';
import ErrorBoundary from './ErrorBoundary';
import './App.css';

interface ClientMove {
  from: string;
  to: string;
  promotion?: string;
  captured?: string;
  captureSquare?: string;
}

function App() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<{
    fen: string;
    color: 'w' | 'b';
    session: string;
    turn: 'w' | 'b';
    status: string;
    isGameOver: boolean;
    isInCheck: boolean;
    winner: string | null;
    isDraw: boolean;
    isCheckmate: boolean;
  } | null>(null);



  // Move deduplication
  const moveInFlight = useRef(false);

  const sendMove = (move: ClientMove) => {
    if (moveInFlight.current) return; // dedupe
    
    const moveData: any = { 
      type: 'move', 
      move: move.from + move.to 
    };
    
    if (move.captured) {
      moveData.captured = move.captured;
      moveData.captureSquare = move.captureSquare;
    }
    
    socket?.send(JSON.stringify(moveData));
    moveInFlight.current = true;
  };

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

    const handleMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      console.log('WebSocket message:', msg);
      
      // 1️⃣ Any message that carries a fresh position should update state
      const carriesFen = 
        msg.type === 'update' ||
        msg.type === 'session' ||      // first handshake for solo games
        msg.type === 'fen' ||          // some back-ends label it like this
        msg.type === 'init';           // previous naming

      if (carriesFen) {
        // Reset move deduplication flag
        moveInFlight.current = false;

        const isGameOver = !!msg.winner || !!msg.isDraw;
        const winner = msg.winner;
        const isDraw = msg.isDraw || false;
        const isCheckmate = msg.isCheckmate || false;
        const isInCheck = msg.isInCheck || false;
        
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

        setGameState({
          fen: msg.fen || 'start',     // Default to 'start' if no FEN
          color,
          session,
          turn: msg.turn || (msg.fen ? msg.fen.split(' ')[1] : 'w'),  // Derive from FEN if turn not provided
          status,
          isGameOver,
          isInCheck,
          winner,
          isDraw,
          isCheckmate
        });
        return;
      }

      // 2️⃣ Messages that don't carry a position
      if (msg.type === 'invalid' || msg.type === 'error') {
        moveInFlight.current = false;
        console.log('Invalid move or error:', msg);
      }
      
      // 3️⃣ Session expired/corrupted - show user-friendly message
      if (msg.type === 'session_expired' || msg.type === 'session_corrupted') {
        console.error('Session issue:', msg);
        alert(msg.error + '\n\nPlease go back to Telegram and start a new game.');
        return;
      }
    };

    ws.addEventListener('message', handleMessage);

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setSocket(null);
    };

    return () => {
      ws.removeEventListener('message', handleMessage);
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
          <ErrorBoundary>
            <Board 
              fen={gameState.fen}
              turn={gameState.turn}
              isGameOver={gameState.isGameOver}
              isInCheck={gameState.isInCheck}
              color={gameState.color}
              onMoveAttempt={sendMove}
            />
          </ErrorBoundary>
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
