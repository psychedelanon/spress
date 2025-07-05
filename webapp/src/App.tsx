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

interface MovePreview {
  from: string;
  to: string;
  piece: string;
  timestamp: number;
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

  // Move preview state
  const [recentMoves, setRecentMoves] = useState<MovePreview[]>([]);

  // Move deduplication
  const moveInFlight = useRef(false);

  const sendMove = (move: ClientMove) => {
    if (moveInFlight.current) return; // dedupe
    
    // Add move preview
    const pieceSymbol = gameState?.fen ? 
      getPieceAt(gameState.fen, move.from) : '?';
    
    const movePreview: MovePreview = {
      from: move.from,
      to: move.to,
      piece: pieceSymbol,
      timestamp: Date.now()
    };
    
    setRecentMoves(prev => [movePreview, ...prev.slice(0, 4)]); // Keep last 5 moves
    
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

  // Helper to get piece symbol from FEN position
  const getPieceAt = (fen: string, square: string): string => {
    try {
      const ranks = fen.split(' ')[0].split('/');
      const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
      const rank = 8 - parseInt(square[1]); // 1=7, 2=6, etc.
      
      let fileIndex = 0;
      for (const char of ranks[rank]) {
        if (char >= '1' && char <= '8') {
          fileIndex += parseInt(char);
        } else {
          if (fileIndex === file) {
            return convertToUnicodeChessPiece(char);
          }
          fileIndex++;
        }
      }
    } catch (err) {
      console.error('Error getting piece at square:', err);
    }
    return '?';
  };

  // Convert FEN piece letters to Unicode chess symbols
  const convertToUnicodeChessPiece = (piece: string): string => {
    const pieces: Record<string, string> = {
      'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
    };
    return pieces[piece] || piece;
  };

  // Extract move info from server updates
  const extractLastMoveFromUpdate = (oldFen: string | undefined, newFen: string, san: string): { from: string; to: string; piece: string } | null => {
    if (!oldFen || !newFen) return null;
    
    try {
      // Simple approach: use the SAN notation to determine piece
      const pieceMatch = san.match(/^([KQRBN])?/);
      let pieceType = pieceMatch?.[1] || 'P'; // Default to pawn if no piece specified
      
      // Determine color based on whose turn it was (opposite of current turn in new FEN)
      const newTurn = newFen.split(' ')[1];
      const wasWhiteTurn = newTurn === 'b'; // If it's black's turn now, white just moved
      const pieceSymbol = wasWhiteTurn ? pieceType.toUpperCase() : pieceType.toLowerCase();
      
      // Extract move coordinates from SAN (simplified)
      const moveMatch = san.match(/([a-h][1-8]).*?([a-h][1-8])/);
      if (moveMatch) {
        return {
          from: moveMatch[1],
          to: moveMatch[2],
          piece: convertToUnicodeChessPiece(pieceSymbol)
        };
      }
      
      // Fallback: just show the piece type and SAN
      return {
        from: '??',
        to: san,
        piece: convertToUnicodeChessPiece(pieceSymbol)
      };
    } catch (err) {
      console.error('Error extracting move:', err);
      return null;
    }
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
      
      // Send keepalive pings every 30 seconds
      const keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(keepAlive);
        }
      }, 30000);
    };

    const handleMessage = (event: MessageEvent) => {
      console.log('🐛 Raw WebSocket data:', event.data);
      const msg = JSON.parse(event.data);
      console.log('🐛 Parsed WebSocket message:', msg);
      console.log('🐛 Message FEN field:', msg.fen);
      console.log('🐛 FEN type:', typeof msg.fen);
      console.log('🐛 FEN length:', msg.fen ? msg.fen.length : 'undefined');
      
      // 1️⃣ Any message that carries a fresh position should update state
      const carriesFen = 
        msg.type === 'update' ||
        msg.type === 'session' ||      // first handshake for solo games
        msg.type === 'fen' ||          // some back-ends label it like this
        msg.type === 'init';           // previous naming

      if (carriesFen) {
        // Reset move deduplication flag
        moveInFlight.current = false;

        // Track moves from server updates (including opponent moves)
        if (msg.san && gameState?.fen !== msg.fen) {
          // Extract the move that was just made by comparing positions
          const lastMove = extractLastMoveFromUpdate(gameState?.fen, msg.fen, msg.san);
          if (lastMove) {
            const movePreview: MovePreview = {
              from: lastMove.from,
              to: lastMove.to,
              piece: lastMove.piece,
              timestamp: Date.now()
            };
            setRecentMoves(prev => [movePreview, ...prev.slice(0, 4)]);
          }
        }

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

        const finalFen = msg.fen || 'start';
        console.log('🐛 Processing FEN:', msg.fen);
        console.log('🐛 FEN split test:', msg.fen ? msg.fen.split(' ') : 'no fen');
        const finalTurn = msg.turn || (msg.fen ? msg.fen.split(' ')[1] : 'w');
        console.log('🐛 Final FEN:', finalFen);
        console.log('🐛 Final turn:', finalTurn);
        
        console.log('🐛 Setting game state:', {
          fen: finalFen,
          turn: finalTurn,
          color,
          session,
          isGameOver,
          isInCheck,
          msgType: msg.type,
          rawMsg: msg
        });

        // TEMPORARY FIX: Force correct starting FEN for testing
        const correctedFen = finalFen === 'start' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : finalFen;
        console.log('🐛 Using corrected FEN:', correctedFen);

        setGameState({
          fen: correctedFen,
          color,
          session,
          turn: finalTurn as 'w' | 'b',
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

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      setSocket(null);
      
      // Try to reconnect if connection was lost unexpectedly
      if (event.code !== 1000 && event.code !== 1001) {
        console.log('Attempting to reconnect...');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
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
        {/* PNG overlay on top left corner */}
        <div className="board-overlay top-left">
          <img 
            src="/overlay.png" 
            alt="Board Overlay" 
            className="board-overlay-image"
            onError={(e) => {
              console.log('Overlay image not found, hiding overlay');
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
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
