import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = { socket: WebSocket; color: 'w' | 'b'; initialFen: string };

// Create custom pieces with error handling and cache busting
const createPieceComponent = (pieceName: string) => {
  return ({ squareWidth }: { squareWidth: number }) => {
    const [error, setError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    
    if (error && retryCount > 1) {
      // Fallback: return null to use default pieces after 2 retries
      console.log(`Failed to load ${pieceName} after retries, using default`);
      return null;
    }
    
    // Add cache busting and retry logic
    const imageUrl = `/pieces/${pieceName}.svg?v=${Date.now()}&retry=${retryCount}`;
    
    return (
      <img 
        src={imageUrl}
        style={{ 
          width: squareWidth, 
          height: squareWidth,
          transition: 'transform 0.15s ease-out'
        }}
        alt={`${pieceName.charAt(0) === 'w' ? 'White' : 'Black'} ${pieceName.charAt(1)}`}
        onError={() => {
          console.error(`Failed to load piece: ${pieceName}.svg (attempt ${retryCount + 1})`);
          if (retryCount < 2) {
            setRetryCount(prev => prev + 1);
          } else {
            setError(true);
          }
        }}
        onLoad={() => {
          console.log(`✅ Successfully loaded: ${pieceName}.svg`);
          if (retryCount > 0) {
            console.log(`✅ Loaded on retry ${retryCount}`);
          }
        }}
      />
    );
  };
};

// Create custom pieces object with error handling
const customPiecesObj = {
  wK: createPieceComponent('wK'),
  wQ: createPieceComponent('wQ'),
  wR: createPieceComponent('wR'),
  wB: createPieceComponent('wB'),
  wN: createPieceComponent('wN'),
  wP: createPieceComponent('wP'),
  bK: createPieceComponent('bK'),
  bQ: createPieceComponent('bQ'),
  bR: createPieceComponent('bR'),
  bB: createPieceComponent('bB'),
  bN: createPieceComponent('bN'),
  bP: createPieceComponent('bP')
};

// Piece name mapping for capture messages
const pieceNames: Record<string, string> = {
  'p': 'Pawn', 'r': 'Rook', 'n': 'Knight', 
  'b': 'Bishop', 'q': 'Queen', 'k': 'King'
};

interface CaptureToastProps {
  message: string;
  onDismiss: () => void;
}

function CaptureToast({ message, onDismiss }: CaptureToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="capture-toast">
      {message}
    </div>
  );
}

export default function Board({ socket, color, initialFen }: Props) {
  const chessRef = useRef(new Chess(initialFen));
  const [fen, setFen] = useState(initialFen);
  const [turn, setTurn] = useState<'w' | 'b'>(initialFen.split(' ')[1] as 'w' | 'b');
  const [isInCheck, setIsInCheck] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [captureFlashSquare, setCaptureFlashSquare] = useState<string | null>(null);
  const [captureToast, setCaptureToast] = useState<string | null>(null);

  // Debug logging and piece testing
  useEffect(() => {
    console.log('[DEBUG] customPieces created:', Object.keys(customPiecesObj));
    console.log('[DEBUG] Sample piece function:', customPiecesObj.wK);
    
    // Test if piece files are accessible
    const testImg = new Image();
    testImg.onload = () => {
      console.log('[DEBUG] ✅ wK.svg loaded successfully');
      console.log('[DEBUG] Image dimensions:', testImg.width, 'x', testImg.height);
    };
    testImg.onerror = (error) => {
      console.log('[DEBUG] ❌ wK.svg failed to load - check file path');
      console.error('[DEBUG] Error details:', error);
      
      // Try fetching directly to get more info
      fetch('/pieces/wK.svg')
        .then(response => {
          console.log('[DEBUG] Fetch response status:', response.status);
          console.log('[DEBUG] Content-Type:', response.headers.get('content-type'));
          return response.text();
        })
        .then(svgText => {
          console.log('[DEBUG] SVG content length:', svgText.length);
          console.log('[DEBUG] SVG starts with:', svgText.substring(0, 100));
        })
        .catch(fetchError => {
          console.error('[DEBUG] Fetch error:', fetchError);
        });
    };
    testImg.src = '/pieces/wK.svg';
  }, []);

  /* ───────────────────────────────────────────────────────── event listeners */
  useEffect(() => {
    socket.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'update') {
        chessRef.current.load(msg.fen);
        setFen(msg.fen);
        setTurn(msg.fen.split(' ')[1] as 'w' | 'b');
        setIsInCheck(msg.isInCheck || false);
        setIsGameOver(msg.winner !== null || msg.isDraw || false);
        // Clear selection when game updates
        setSelectedSquare(null);
        
        // Show capture flash if this was from a capture by opponent
        if (msg.captured && msg.captureSquare) {
          setCaptureFlashSquare(msg.captureSquare);
          setCaptureToast(`💥 ${msg.captured} captured!`);
          setTimeout(() => setCaptureFlashSquare(null), 400);
        }
      }
    };
  }, [socket]);

  /* ───────────────────────────────────────────────────────── drag handlers */
  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      // Don't allow moves if game is over
      if (isGameOver) return false;
      // only allow if it's my move
      if (turn !== color) return false;

      const move = chessRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move == null) return false; // illegal
      
      // Detect capture and create flash animation
      if (move.captured) {
        const capturedPieceName = pieceNames[move.captured.toLowerCase()] || 'Piece';
        const capturingColor = move.color === 'w' ? 'White' : 'Black';
        
        // Flash the destination square
        setCaptureFlashSquare(targetSquare);
        setTimeout(() => setCaptureFlashSquare(null), 400);
        
        // Show capture toast
        setCaptureToast(`💥 ${capturingColor} captured a ${capturedPieceName}!`);
      }

      setFen(chessRef.current.fen());

      // send UCI to backend with capture info
      const moveData: any = { type: 'move', move: sourceSquare + targetSquare };
      if (move.captured) {
        moveData.captured = `${pieceNames[move.captured.toLowerCase()] || 'Piece'}`;
        moveData.captureSquare = targetSquare;
      }
      
      socket.send(JSON.stringify(moveData));
      return true;
    },
    [socket, turn, color, isGameOver],
  );

  /* ───────────────────────────────────────────────────────── square styles */
  const [moveSquares, setMoveSquares] = useState<Record<string, React.CSSProperties>>({});

  // Function to find the king's square for the current player
  const findKingSquare = useCallback((playerColor: 'w' | 'b') => {
    const board = chessRef.current.board();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece && piece.type === 'k' && piece.color === playerColor) {
          const file = String.fromCharCode(97 + col); // a-h
          const rank = (8 - row).toString(); // 1-8
          return file + rank;
        }
      }
    }
    return null;
  }, []);

  // Generate custom square styles including king check animation and capture flash
  const getCustomSquareStyles = useCallback(() => {
    const styles: Record<string, React.CSSProperties> = { ...moveSquares };
    
    // Add selected square highlight
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...styles[selectedSquare],
        background: 'rgba(255, 255, 0, 0.4)',
        border: '2px solid #FFD700'
      };
    }
    
    // Add capture flash animation
    if (captureFlashSquare) {
      styles[captureFlashSquare] = {
        ...styles[captureFlashSquare],
        animation: 'captureFlash 0.4s ease-out'
      };
    }
    
    // Add king check animation if in check
    if (isInCheck) {
      const kingSquare = findKingSquare(turn);
      if (kingSquare) {
        styles[kingSquare] = {
          ...styles[kingSquare],
          border: '4px solid #E01313',
          borderRadius: '50%',
          animation: 'shake 0.5s ease-in-out infinite',
          boxShadow: '0 0 15px rgba(224, 19, 19, 0.7)'
        };
      }
    }
    
    return styles;
  }, [moveSquares, selectedSquare, captureFlashSquare, isInCheck, turn, findKingSquare]);

  const highlightMoves = useCallback((square: string) => {
    if (turn !== color || isGameOver) return;
    
    const moves = chessRef.current.moves({ square: square as any, verbose: true }) as any[];
    const highlights: Record<string, React.CSSProperties> = {};
    
    moves.forEach(m => { 
      highlights[m.to] = { 
        background: 'radial-gradient(circle, #ffde00 25%, transparent 26%)',
        borderRadius: '50%'
      }; 
    });
    
    setMoveSquares(highlights);
  }, [turn, color, isGameOver]);

  const onMouseOverSquare = (sq: string) => {
    highlightMoves(sq);
  };

  const onMouseOutSquare = () => {
    // Only clear highlights if no square is selected
    if (!selectedSquare) {
      setMoveSquares({});
    }
  };

  // Handle square clicks for mobile tap-to-select
  const onSquareClick = useCallback((square: string) => {
    if (turn !== color || isGameOver) return;
    
    const piece = chessRef.current.get(square as any);
    
    // If clicking on own piece, select it
    if (piece && piece.color === color) {
      setSelectedSquare(square);
      highlightMoves(square);
    }
    // If a piece is selected and clicking on a highlighted square, make the move
    else if (selectedSquare && moveSquares[square]) {
      const move = chessRef.current.move({
        from: selectedSquare,
        to: square,
        promotion: 'q',
      });

      if (move != null) {
        // Detect capture for mobile tap moves
        if (move.captured) {
          const capturedPieceName = pieceNames[move.captured.toLowerCase()] || 'Piece';
          const capturingColor = move.color === 'w' ? 'White' : 'Black';
          
          // Flash the destination square
          setCaptureFlashSquare(square);
          setTimeout(() => setCaptureFlashSquare(null), 400);
          
          // Show capture toast
          setCaptureToast(`💥 ${capturingColor} captured a ${capturedPieceName}!`);
        }

        setFen(chessRef.current.fen());
        
        // Send move with capture info
        const moveData: any = { type: 'move', move: selectedSquare + square };
        if (move.captured) {
          moveData.captured = `${pieceNames[move.captured.toLowerCase()] || 'Piece'}`;
          moveData.captureSquare = square;
        }
        
        socket.send(JSON.stringify(moveData));
      }
      
      // Clear selection after move attempt
      setSelectedSquare(null);
      setMoveSquares({});
    }
    // If clicking elsewhere, clear selection
    else {
      setSelectedSquare(null);
      setMoveSquares({});
    }
  }, [turn, color, isGameOver, selectedSquare, moveSquares, highlightMoves, socket]);

  /* ───────────────────────────────────────────────────────── render board */
  return (
    <div className="board-container">
      <Chessboard
        id="SPRESSBoard"
        position={fen}
        boardOrientation={color === 'w' ? 'white' : 'black'}
        onPieceDrop={onPieceDrop}
        onMouseOverSquare={onMouseOverSquare}
        onMouseOutSquare={onMouseOutSquare}
        onSquareClick={onSquareClick}
        customSquareStyles={getCustomSquareStyles()}
        customPieces={customPiecesObj as any}
        animationDuration={150}
        boardWidth={Math.min(window.innerWidth - 40, 480)}
        customDarkSquareStyle={{ backgroundColor: '#0053FF' }}   // SPRESS blue
        customLightSquareStyle={{ backgroundColor: '#FFD700' }} // SPRESS yellow
        customBoardStyle={{
          borderRadius: '8px',
          border: '4px solid #E01313',
          transition: 'transform 0.15s ease-out'
        }}
        arePiecesDraggable={turn === color && !isGameOver}
      />
      
      {/* Capture Toast */}
      {captureToast && (
        <CaptureToast 
          message={captureToast}
          onDismiss={() => setCaptureToast(null)}
        />
      )}
    </div>
  );
} 