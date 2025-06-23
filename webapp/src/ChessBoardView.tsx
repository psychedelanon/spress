import React, { useEffect, useState, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { TelegramBridge } from './TelegramBridge';

interface ChessBoardViewProps {
  sessionId: string;
}

interface GameState {
  fen: string;
  san?: string;
  pgn?: string;
  isCheckmate?: boolean;
  isGameOver?: boolean;
}

export const ChessBoardView: React.FC<ChessBoardViewProps> = ({ sessionId }) => {
  const [gameState, setGameState] = useState<GameState>({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' // Starting position
  });
  const [chess] = useState(() => new Chess());
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [lastMove, setLastMove] = useState<string>('');
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);

  const telegram = TelegramBridge.getInstance();

  // WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setWs(websocket);
    };

    websocket.onmessage = (event) => {
      try {
        const data: GameState = JSON.parse(event.data);
        console.log('Received game state:', data);
        
        setGameState(data);
        chess.load(data.fen);
        
        if (data.san) {
          setLastMove(data.san);
          // Haptic feedback for moves
          telegram.hapticFeedback('impact', 'light');
          
          if (data.isCheckmate) {
            telegram.hapticFeedback('notification', 'success');
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
      setWs(null);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
    };

    return () => {
      websocket.close();
    };
  }, [sessionId, chess, telegram]);

  // Determine player color based on Telegram user (simplified for demo)
  useEffect(() => {
    const user = telegram.getUser();
    if (user) {
      // For demo, randomly assign color or use user ID
      setPlayerColor(user.id % 2 === 0 ? 'white' : 'black');
    } else {
      // Development mode - allow playing both sides
      setPlayerColor('white');
    }
  }, [telegram]);

  const onPieceDrop = useCallback((sourceSquare: string, targetSquare: string) => {
    const move = sourceSquare + targetSquare;
    
    try {
      // Validate move locally first
      const testChess = new Chess(gameState.fen);
      const moveResult = testChess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q' // Auto-promote to queen for simplicity
      });

      if (!moveResult) {
        console.log('Invalid move:', move);
        return false;
      }

      // Send move via WebSocket if connected
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'move',
          sessionId,
          move: moveResult.san
        }));
      }

      // Also send to Telegram if available
      telegram.sendMove(sessionId, moveResult.san);
      
      // Haptic feedback for successful move
      telegram.hapticFeedback('selection');

      console.log('Move sent:', moveResult.san);
      return true;

    } catch (error) {
      console.error('Error making move:', error);
      return false;
    }
  }, [gameState.fen, ws, sessionId, telegram]);

  const getBoardOrientation = (): 'white' | 'black' => {
    return playerColor || 'white';
  };

  const getStatusMessage = () => {
    if (connectionStatus === 'connecting') {
      return 'Connecting to game...';
    }
    if (connectionStatus === 'disconnected') {
      return 'Disconnected from game';
    }
    if (gameState.isGameOver) {
      if (gameState.isCheckmate) {
        return 'Game Over - Checkmate!';
      }
      return 'Game Over';
    }
    
    const turn = chess.turn() === 'w' ? 'White' : 'Black';
    const inCheck = chess.inCheck() ? ' (Check!)' : '';
    return `${turn} to move${inCheck}`;
  };

  return (
    <div style={{ 
      padding: '10px',
      maxWidth: '100vw',
      background: 'var(--tg-bg-color, #ffffff)',
      color: 'var(--tg-text-color, #000000)',
      minHeight: '100vh'
    }}>
      {/* Status Bar */}
      <div style={{
        textAlign: 'center',
        marginBottom: '10px',
        padding: '8px',
        borderRadius: '8px',
        backgroundColor: connectionStatus === 'connected' ? '#4CAF50' : '#FF9800',
        color: 'white',
        fontSize: '14px',
        fontWeight: 'bold'
      }}>
        {getStatusMessage()}
      </div>

      {/* Last Move Display */}
      {lastMove && (
        <div style={{
          textAlign: 'center',
          marginBottom: '10px',
          padding: '6px',
          backgroundColor: 'var(--tg-button-color, #0088cc)',
          color: 'white',
          borderRadius: '6px',
          fontSize: '16px'
        }}>
          Last move: {lastMove}
        </div>
      )}

      {/* Chess Board */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '10px'
      }}>
        <div style={{ 
          width: '90vw', 
          maxWidth: '400px',
          aspectRatio: '1/1'
        }}>
          <Chessboard
            position={gameState.fen}
            onPieceDrop={onPieceDrop}
            boardOrientation={getBoardOrientation()}
            arePiecesDraggable={connectionStatus === 'connected' && !gameState.isGameOver}
            boardWidth={Math.min(window.innerWidth * 0.9, 400)}
            customBoardStyle={{
              borderRadius: '4px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
            }}
          />
        </div>
      </div>

      {/* Game Info */}
      <div style={{
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--tg-text-color, #666)',
        marginTop: '10px'
      }}>
        Playing as {playerColor} pieces
        <br />
        Session: {sessionId.slice(-8)}
      </div>

      {/* Debug Info (development only) */}
      {!telegram.isAvailable() && (
        <div style={{
          marginTop: '20px',
          padding: '10px',
          backgroundColor: '#f0f0f0',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#666'
        }}>
          <strong>Development Mode</strong>
          <br />
          WebSocket: {connectionStatus}
          <br />
          FEN: {gameState.fen.slice(0, 30)}...
        </div>
      )}
    </div>
  );
}; 