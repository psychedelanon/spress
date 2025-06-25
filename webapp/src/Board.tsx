import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STABLE_PIECE_RENDERERS } from './pieceRenderers';

interface ClientMove {
  from: string;
  to: string;
  promotion?: string;
  captured?: string;
  captureSquare?: string;
}

type Props = { 
  fen: string;
  turn: 'w' | 'b';
  isGameOver: boolean;
  isInCheck: boolean;
  color: 'w' | 'b';
  onMoveAttempt: (move: ClientMove) => void;
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

export default function Board({ fen, turn, isGameOver, isInCheck, color, onMoveAttempt }: Props) {
  const chessRef = useRef(new Chess(fen));
  
  // Keep chess.js in sync with props
  useEffect(() => {
    if (!fen || fen === '') return;  // still waiting for server
    try {
      chessRef.current.load(fen);
    } catch (err) {
      console.error('Bad FEN received:', fen, err);
      return;  // don't re-throw – UI stays up
    }
  }, [fen]);

  // UI-only state (no game state)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [captureFlashSquare, setCaptureFlashSquare] = useState<string | null>(null);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  
  // Mobile drag/tap conflict prevention
  const isDragging = useRef(false);

  // Use the stable piece renderers - this reference NEVER changes
  const customPieces = STABLE_PIECE_RENDERERS;

  // Debug logging and piece testing
  useEffect(() => {
    console.log('[DEBUG] customPieces created:', Object.keys(customPieces));
    console.log('[DEBUG] Sample piece function:', customPieces.wK);
    
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
      fetch(`${import.meta.env.BASE_URL}pieces/wK.svg`)
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
    testImg.src = `${import.meta.env.BASE_URL}pieces/wK.svg`;
  }, []); // Empty dependency array since STABLE_PIECE_RENDERERS never changes

  // Clear UI state when game updates (for server captures)
  useEffect(() => {
    setSelectedSquare(null);
  }, [fen]);

  /* ───────────────────────────────────────────────────────── drag handlers */
  const onDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  const onDragEnd = useCallback(() => {
    // Small delay to prevent tap events from firing immediately after drag
    setTimeout(() => {
      isDragging.current = false;
    }, 50);
  }, []);

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      console.log('🎯 [MOVE ATTEMPT]', { sourceSquare, targetSquare, turn, color, isGameOver });
      
      // Don't allow moves if game is over
      if (isGameOver) {
        console.log('❌ Move blocked: game over');
        return false;
      }
      // only allow if it's my move
      if (turn !== color) {
        console.log('❌ Move blocked: wrong turn', { turn, color });
        return false;
      }

      const move = chessRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move == null) return false; // illegal
      
      // Handle capture flash UI only
      if (move.captured) {
        const capturedPieceName = pieceNames[move.captured.toLowerCase()] || 'Piece';
        const capturingColor = move.color === 'w' ? 'White' : 'Black';
        
        // Flash the destination square
        setCaptureFlashSquare(targetSquare);
        setTimeout(() => setCaptureFlashSquare(null), 400);
        
        // Show capture toast
        setCaptureToast(`💥 ${capturingColor} captured a ${capturedPieceName}!`);
      }

      // Clear UI state only (no game state updates!)
      setSelectedSquare(null);

      // Send move to parent via callback
      onMoveAttempt({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
        captured: move.captured ? pieceNames[move.captured.toLowerCase()] || 'Piece' : undefined,
        captureSquare: move.captured ? targetSquare : undefined
      });
      
      return true;
    },
    [turn, color, isGameOver, onMoveAttempt],
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
    // Ignore taps when a drag just finished
    if (isDragging.current) return;

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
        // Handle capture flash UI only
        if (move.captured) {
          const capturedPieceName = pieceNames[move.captured.toLowerCase()] || 'Piece';
          const capturingColor = move.color === 'w' ? 'White' : 'Black';
          
          // Flash the destination square
          setCaptureFlashSquare(square);
          setTimeout(() => setCaptureFlashSquare(null), 400);
          
          // Show capture toast
          setCaptureToast(`💥 ${capturingColor} captured a ${capturedPieceName}!`);
        }

        // Send move to parent via callback
        onMoveAttempt({
          from: selectedSquare,
          to: square,
          promotion: 'q',
          captured: move.captured ? pieceNames[move.captured.toLowerCase()] || 'Piece' : undefined,
          captureSquare: move.captured ? square : undefined
        });
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
  }, [turn, color, isGameOver, selectedSquare, moveSquares, highlightMoves, onMoveAttempt]);

  /* ───────────────────────────────────────────────────────── render board */
  return (
    <div className="board-container">
      <Chessboard
        id="SPRESSBoard"
        position={fen && fen !== '' ? fen : 'start'}
        boardOrientation={color === 'w' ? 'white' : 'black'}
        onPieceDrop={onPieceDrop}
        onPieceDragBegin={onDragStart}
        onPieceDragEnd={onDragEnd}
        onMouseOverSquare={onMouseOverSquare}
        onMouseOutSquare={onMouseOutSquare}
        onSquareClick={onSquareClick}
        customSquareStyles={getCustomSquareStyles()}
        customPieces={customPieces as any}
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