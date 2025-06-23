import { useEffect, useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import ReconnectingWebSocket from 'reconnecting-websocket';
import './App.css';

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session') || 'demo';
const playerColor = params.get('color') as 'w' | 'b' || 'w';

const wsBase = window.location.origin.replace(/^http/, 'ws');
const ws = new ReconnectingWebSocket(`${wsBase}/ws?session=${sessionId}&color=${playerColor}`);

export default function App() {
  const [fen, setFen] = useState('start');
  const [turn, setTurn] = useState<'w'|'b'>('w');
  const [status, setStatus] = useState('Connecting…');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{from: string, to: string} | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  
  const chess = new Chess();
  const playing = playerColor === turn && !gameOver;

  useEffect(() => {
    WebApp.ready(); 
    WebApp.expand();
    
    ws.onopen = () => {
      setStatus('Connected');
    };
    
    ws.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.type !== 'update') return;
      
      setFen(data.fen);
      setTurn(data.turn);
      
      // Update chess instance for move validation
      chess.load(data.fen);
      
      if (data.winner) {
        setWinner(data.winner);
        setGameOver(true);
        setStatus(`${data.winner} wins!`);
        // Haptic feedback for game end
        if (WebApp.HapticFeedback) {
          WebApp.HapticFeedback.notificationOccurred('success');
        }
      } else {
        setGameOver(false);
        setWinner(null);
        setStatus(playing ? 'Your move' : 'Waiting…');
      }
      
      // Clear selection when move is made
      setSelectedSquare(null);
      setLegalMoves([]);
      
      // Update last move for highlighting
      if (data.san) {
        // Parse SAN to get from/to squares (simplified)
        const moves = chess.history({ verbose: true });
        if (moves.length > 0) {
          const move = moves[moves.length - 1];
          setLastMove({ from: move.from, to: move.to });
        }
      }
    };
    
    ws.onclose = () => {
      setStatus('Disconnected');
    };
    
    ws.onerror = () => {
      setStatus('Connection error');
    };
  }, [playing]);

  // Handle piece drag and drop
  const onPieceDrop = useCallback((sourceSquare: string, targetSquare: string) => {
    if (!playing) return false;
    
    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q' // Auto-promote to queen
      });
      
      if (!move) return false;
      
      // Send move via WebSocket
      ws.send(JSON.stringify({ type: 'move', move: sourceSquare + targetSquare }));
      
      // Haptic feedback for successful move
      if (WebApp.HapticFeedback) {
        WebApp.HapticFeedback.selectionChanged();
      }
      
      return true;
    } catch {
      return false;
    }
  }, [playing]);

  // Handle square clicks for tap-to-move
  const onSquareClick = useCallback((square: string) => {
    if (!playing) return;
    
    const piece = chess.get(square as any);
    
    // If no piece is selected
    if (!selectedSquare) {
      // If clicked square has player's piece, select it
      if (piece && piece.color === playerColor) {
        setSelectedSquare(square);
        // Get legal moves for this piece
        const moves = chess.moves({ square: square as any, verbose: true }) as any[];
        setLegalMoves(moves.map(move => move.to));
        
        // Haptic feedback for selection
        if (WebApp.HapticFeedback) {
          WebApp.HapticFeedback.impactOccurred('light');
        }
      }
      return;
    }
    
    // If piece is already selected
    if (selectedSquare === square) {
      // Deselect if clicking same square
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }
    
    // If clicking on another piece of same color, select it instead
    if (piece && piece.color === playerColor) {
      setSelectedSquare(square);
      const moves = chess.moves({ square: square as any, verbose: true }) as any[];
      setLegalMoves(moves.map(move => move.to));
      return;
    }
    
    // If clicking on a legal move square, make the move
    if (legalMoves.includes(square)) {
      try {
        const move = chess.move({
          from: selectedSquare,
          to: square,
          promotion: 'q'
        });
        
        if (move) {
          ws.send(JSON.stringify({ type: 'move', move: selectedSquare + square }));
          
          // Haptic feedback for successful move
          if (WebApp.HapticFeedback) {
            WebApp.HapticFeedback.selectionChanged();
          }
        }
      } catch (error) {
        console.error('Move error:', error);
      }
      
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }, [selectedSquare, legalMoves, playing, playerColor]);

  // Custom square styles for theming and highlighting
  const getSquareStyles = useCallback(() => {
    const styles: { [square: string]: React.CSSProperties } = {};
    
    // Highlight selected square
    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: 'rgba(255, 255, 0, 0.4)',
        borderRadius: '50%',
      };
    }
    
    // Highlight legal move squares
    legalMoves.forEach(square => {
      styles[square] = {
        background: 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        cursor: 'pointer'
      };
    });
    
    // Highlight last move
    if (lastMove) {
      styles[lastMove.from] = {
        ...styles[lastMove.from],
        backgroundColor: 'rgba(255, 255, 0, 0.2)'
      };
      styles[lastMove.to] = {
        ...styles[lastMove.to],
        backgroundColor: 'rgba(255, 255, 0, 0.2)'
      };
    }
    
    return styles;
  }, [selectedSquare, legalMoves, lastMove]);

  return (
    <div className="root">
      <header className="header">SPRESS</header>
      
      <div className="status-bar">
        <div className={`status-indicator ${status.toLowerCase().replace(' ', '-')}`}>
          {status}
        </div>
        {gameOver && winner && (
          <div className="winner-announcement">
            🎉 {winner.charAt(0).toUpperCase() + winner.slice(1)} Wins!
          </div>
        )}
      </div>
      
      <div className="board-container">
        <Chessboard
          position={fen}
          onPieceDrop={onPieceDrop}
          onSquareClick={onSquareClick}
          arePiecesDraggable={playing}
          boardOrientation={playerColor === 'b' ? 'black' : 'white'}
          boardWidth={Math.min(WebApp.viewportHeight - 140, 380)}
          customDarkSquareStyle={{ backgroundColor: '#0053FF' }}
          customLightSquareStyle={{ backgroundColor: '#FFD700' }}
          customSquareStyles={getSquareStyles()}
          animationDuration={200}
          showBoardNotation={false}
          customBoardStyle={{
            borderRadius: '8px',
            border: '4px solid #E01313'
          }}
        />
      </div>
      
      <div className="game-info">
        <p className="player-color">
          Playing as {playerColor === 'w' ? 'White' : 'Black'}
        </p>
        {selectedSquare && (
          <p className="instruction">
            Tap a highlighted square to move your piece
          </p>
        )}
        {!selectedSquare && playing && (
          <p className="instruction">
            Tap a piece to select it, or drag to move
          </p>
        )}
      </div>
    </div>
  );
}
