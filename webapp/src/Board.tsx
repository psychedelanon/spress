import { Chessboard } from 'react-chessboard';
import { useCallback, useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
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

// Capture Toast Component
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
  console.log('🎯 Board props:', { fen, turn, color });
  
  // SUPER SAFE FEN - always use starting position if anything looks wrong
  const safeFen = (fen && fen !== 'start' && fen.length > 20) ? fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  console.log('🎯 Using safe FEN:', safeFen);

  // Chess.js instance for move validation and highlighting
  const chessRef = useRef(new Chess());
  
  // Keep chess.js in sync with position
  useEffect(() => {
    try {
      chessRef.current.load(safeFen);
    } catch (err) {
      console.error('Failed to load FEN in chess.js:', err);
      chessRef.current.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    }
  }, [safeFen]);

  // UI state for delightful effects
  const [captureFlashSquare, setCaptureFlashSquare] = useState<string | null>(null);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  
  // Mobile drag/tap conflict prevention
  const isDragging = useRef(false);

  // Only allow dragging of our own pieces
  const isDraggablePiece = useCallback(
    ({ piece }: { piece: string; sourceSquare: string }) => {
      if (turn !== color || isGameOver) return false;
      return piece[0] === color;
    },
    [turn, color, isGameOver]
  );

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

      // Validate move locally but don't keep it on the board
      const move = chessRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move == null) return false; // illegal move - snap back
      
      // Revert the move immediately (we only validated it)
      chessRef.current.undo();
      
      // Handle capture flash UI only (based on the validated move)
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
      
      // Let piece stay on target square; board will update when server confirms
      return true;
    },
    [turn, color, isGameOver, onMoveAttempt],
  );

  /* ───────────────────────────────────────────────────────── square styles */
  const [moveSquares, setMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  // Piece name mapping for capture messages
  const pieceNames: Record<string, string> = {
    'p': 'Pawn', 'r': 'Rook', 'n': 'Knight', 
    'b': 'Bishop', 'q': 'Queen', 'k': 'King'
  };

  // Show legal moves for a square - works for ANY piece to show what's possible
  const highlightLegalMoves = useCallback((square: string) => {
    if (isGameOver) return;
    
    try {
      // Check if there's a piece on this square
      const piece = chessRef.current.get(square as any);
      if (!piece) {
        setMoveSquares({});
        return;
      }
      
      // Get all possible moves from this square
      const moves = chessRef.current.moves({ square: square as any, verbose: true }) as any[];
      const highlights: Record<string, React.CSSProperties> = {};
      
      moves.forEach(move => { 
        // Different highlight for captures vs normal moves
        const isCapture = move.captured;
        highlights[move.to] = isCapture ? {
          background: 'radial-gradient(circle, rgba(224, 19, 19, 0.8) 35%, transparent 36%)',
          borderRadius: '50%',
          border: '3px solid #E01313',
          boxShadow: '0 0 8px rgba(224, 19, 19, 0.6)'
        } : {
          background: 'radial-gradient(circle, rgba(0, 83, 255, 0.7) 35%, transparent 36%)',
          borderRadius: '50%',
          border: '3px solid #0053FF',
          boxShadow: '0 0 8px rgba(0, 83, 255, 0.4)'
        };
      });
      
      setMoveSquares(highlights);
    } catch (err) {
      console.error('Error highlighting moves:', err);
      setMoveSquares({});
    }
  }, [isGameOver]);

  // Generate delightful square styles
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
      // Find king square dynamically
      try {
        const board = chessRef.current.board();
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && piece.type === 'k' && piece.color === turn) {
              const file = String.fromCharCode(97 + col); // a-h
              const rank = (8 - row).toString(); // 1-8
              const kingSquare = file + rank;
              styles[kingSquare] = {
                ...styles[kingSquare],
                border: '4px solid #E01313',
                borderRadius: '50%',
                animation: 'shake 0.5s ease-in-out infinite',
                boxShadow: '0 0 15px rgba(224, 19, 19, 0.7)'
              };
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error finding king square:', err);
      }
    }
    
    return styles;
  }, [moveSquares, selectedSquare, captureFlashSquare, isInCheck, turn]);

  // Square click handler for mobile
  const onSquareClick = useCallback((square: string) => {
    if (turn !== color || isGameOver) return;
    
    try {
      const piece = chessRef.current.get(square as any);
      
      // If clicking on own piece, select it and show moves
      if (piece && piece.color === color) {
        setSelectedSquare(square);
        highlightLegalMoves(square);
      }
      // If a piece is selected and clicking on a highlighted square, make the move
      else if (selectedSquare && moveSquares[square]) {
        // Try the move
        const move = chessRef.current.move({
          from: selectedSquare,
          to: square,
          promotion: 'q'
        });

        if (move) {
          // Undo the move (we just validated it)
          chessRef.current.undo();
          
          // Handle capture flash
          if (move.captured) {
            setCaptureFlashSquare(square);
            setTimeout(() => setCaptureFlashSquare(null), 400);
            setCaptureToast(`💥 ${color === 'w' ? 'White' : 'Black'} captured a ${pieceNames[move.captured.toLowerCase()] || 'piece'}!`);
          }

          // Send move to server
          onMoveAttempt({
            from: selectedSquare,
            to: square,
            promotion: 'q'
          });
        }
        
        // Clear selection
        setSelectedSquare(null);
        setMoveSquares({});
      }
      // If clicking elsewhere, clear selection
      else {
        setSelectedSquare(null);
        setMoveSquares({});
      }
    } catch (err) {
      console.error('Error in square click:', err);
      setSelectedSquare(null);
      setMoveSquares({});
    }
  }, [turn, color, isGameOver, selectedSquare, moveSquares, highlightLegalMoves, onMoveAttempt, pieceNames]);

  // Mouse hover for move previews
  const onMouseOverSquare = useCallback((square: string) => {
    // Always show moves on hover, but don't override selected square highlights
    highlightLegalMoves(square);
  }, [highlightLegalMoves]);

  const onMouseOutSquare = useCallback(() => {
    // Only clear if no square is selected
    if (!selectedSquare) {
      setMoveSquares({});
    }
  }, [selectedSquare]);

  return (
    <div className="board-container">
      <Chessboard
        id="SPRESSBoard"
        position={safeFen}
        boardOrientation={color === 'w' ? 'white' : 'black'}
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        onMouseOverSquare={onMouseOverSquare}
        onMouseOutSquare={onMouseOutSquare}
        customSquareStyles={getCustomSquareStyles()}
        customPieces={STABLE_PIECE_RENDERERS}

        animationDuration={150}
        boardWidth={Math.min(window.innerWidth - 40, 480)}
        customDarkSquareStyle={{ backgroundColor: '#0053FF' }}   // SPRESS blue
        customLightSquareStyle={{ backgroundColor: '#FFD700' }}  // SPRESS yellow
        customBoardStyle={{
          borderRadius: '8px',
          border: '4px solid #E01313',
          transition: 'transform 0.15s ease-out',
          boxShadow: '0 4px 20px rgba(224, 19, 19, 0.3)'
        }}
        arePiecesDraggable={turn === color && !isGameOver}
        isDraggablePiece={isDraggablePiece}
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