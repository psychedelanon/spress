import React, { useEffect, useState, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { Chess } from 'chess.js';
import ErrorBoundary from './ErrorBoundary';
import './App.css';

// Lazy load components
const Board = lazy(() => import('./Board'));

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

interface GameState {
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
}

// Memoized Unicode chess symbols mapping
const UNICODE_PIECES: Record<string, string> = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// Loading component
const LoadingSpinner = React.memo(() => (
  <div className="loading">Connecting to game...</div>
));

// Game Over Overlay component
const GameOverOverlay = React.memo(({ message }: { message: string }) => (
  <div className="game-over-overlay">
    <div className="game-outcome-message">
      {message}
    </div>
  </div>
));

function App() {
  const url = useMemo(() => new URL(window.location.href), []);
  const spectator = useMemo(() => url.searchParams.get('spectator') === '1', [url]);
  const replayParam = useMemo(() => url.searchParams.get('replay'), [url]);

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Move preview state
  const [recentMoves, setRecentMoves] = useState<MovePreview[]>([]);

  // Move deduplication
  const moveInFlight = useRef(false);
  const [replayMoves, setReplayMoves] = useState<string[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);

  // Memoized URL parameters
  const urlParams = useMemo(() => ({
    session: url.searchParams.get('session'),
    color: (url.searchParams.get('color') ?? 'w') as 'w' | 'b'
  }), [url]);

  // Memoized WebSocket URL
  const wsUrl = useMemo(() => {
    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${location.host}/ws`;
  }, []);

  // Replay keyboard handler
  useEffect(() => {
    if (!replayMoves.length) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setReplayIndex(i => Math.min(replayMoves.length, i + 1));
      if (e.key === 'ArrowLeft') setReplayIndex(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [replayMoves.length]);

  // Replay state updater
  useEffect(() => {
    if (!replayMoves.length) return;
    const chess = new Chess();
    for (let i = 0; i < replayIndex; i++) chess.move(replayMoves[i]);
    setGameState({
      fen: chess.fen(),
      color: 'w',
      session: 'replay',
      turn: chess.turn() as 'w' | 'b',
      status: `Move ${replayIndex}/${replayMoves.length}`,
      isGameOver: replayIndex === replayMoves.length,
      isInCheck: chess.inCheck(),
      winner: null,
      isDraw: chess.isDraw(),
      isCheckmate: chess.isCheckmate()
    });
  }, [replayIndex, replayMoves]);

  // Optimized move sender
  const sendMove = useCallback((move: ClientMove) => {
    if (moveInFlight.current || !socket) return; // dedupe and null check
    
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
    
    socket.send(JSON.stringify(moveData));
    moveInFlight.current = true;
  }, [socket, gameState?.fen]);

  // Helper to get piece symbol from FEN position
  const getPieceAt = useCallback((fen: string, square: string): string => {
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
            return UNICODE_PIECES[char] || char;
          }
          fileIndex++;
        }
      }
    } catch (err) {
      console.error('Error getting piece at square:', err);
    }
    return '?';
  }, []);

  // Extract move info from server updates
  const extractLastMoveFromUpdate = useCallback((oldFen: string | undefined, newFen: string, san: string): { from: string; to: string; piece: string } | null => {
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
          piece: UNICODE_PIECES[pieceSymbol] || pieceSymbol
        };
      }
      
      // Fallback: just show the piece type and SAN
      return {
        from: '??',
        to: san,
        piece: UNICODE_PIECES[pieceSymbol] || pieceSymbol
      };
    } catch (err) {
      console.error('Error extracting move:', err);
      return null;
    }
  }, []);

  // Generate game outcome message
  const getGameOutcomeMessage = useCallback(() => {
    if (!gameState?.isGameOver) return null;
    
    if (gameState.isDraw) {
      return 'Draw';
    } else if (gameState.isCheckmate && gameState.winner) {
      return `Checkmate – ${gameState.winner === 'white' ? 'White' : 'Black'} wins`;
    } else if (gameState.winner) {
      return `${gameState.winner === 'white' ? 'White' : 'Black'} wins`;
    }
    
    return 'Game Over';
  }, [gameState?.isGameOver, gameState?.isDraw, gameState?.isCheckmate, gameState?.winner]);

  // Memoized WebSocket message handler
  const handleMessage = useCallback((event: MessageEvent) => {
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
        color: urlParams.color,
        session: urlParams.session,
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
        color: urlParams.color,
        session: urlParams.session || 'unknown',
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
  }, [gameState?.fen, urlParams.color, urlParams.session, extractLastMoveFromUpdate]);

  // Main WebSocket connection effect
  useEffect(() => {
    if (replayParam) {
      try {
        const pgn = atob(replayParam);
        const chess = new Chess();
        chess.loadPgn(pgn);
        setReplayMoves(chess.history());
        setGameState({
          fen: chess.fen(),
          color: 'w',
          session: 'replay',
          turn: chess.turn() as 'w' | 'b',
          status: 'Replay',
          isGameOver: false,
          isInCheck: false,
          winner: null,
          isDraw: false,
          isCheckmate: false
        });
      } catch (err) {
        console.error('Failed to load replay', err);
      }
      return;
    }
    
    if (!urlParams.session) {
      console.error('No session ID provided');
      return;
    }

    // Create WebSocket connection
    const ws = new WebSocket(`${wsUrl}?session=${urlParams.session}&color=${urlParams.color}`);
    
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
  }, [replayParam, urlParams.session, urlParams.color, wsUrl, handleMessage]);

  // Memoized game outcome message
  const gameOutcomeMessage = useMemo(() => getGameOutcomeMessage(), [getGameOutcomeMessage]);

  // Memoized instruction text
  const instructionText = useMemo(() => {
    if (!gameState) return '';
    
    if (gameState.isGameOver) {
      return 'Game finished';
    }
    
    return gameState.turn === gameState.color ? 
      'Your turn - drag pieces to move!' : 
      'Waiting for opponent...';
  }, [gameState?.isGameOver, gameState?.turn, gameState?.color]);

  // Loading state
  if (!socket || !gameState) {
    return (
      <div className="app-container">
        <h1 className="title">SPRESS Chess</h1>
        <LoadingSpinner />
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
            <Suspense fallback={<LoadingSpinner />}>
              <Board
                fen={gameState.fen}
                turn={gameState.turn}
                isGameOver={gameState.isGameOver}
                isInCheck={gameState.isInCheck}
                color={gameState.color}
                onMoveAttempt={sendMove}
                readOnly={spectator || replayMoves.length > 0}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      
      <div className="instructions">
        {instructionText}
      </div>

      {/* Game Outcome Overlay */}
      {gameState.isGameOver && gameOutcomeMessage && (
        <GameOverOverlay message={gameOutcomeMessage} />
      )}
    </div>
  );
}

export default App;
