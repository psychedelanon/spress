import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = { socket: WebSocket; color: 'w' | 'b'; initialFen: string };

export default function Board({ socket, color, initialFen }: Props) {
  const chessRef = useRef(new Chess(initialFen));
  const [fen, setFen] = useState(initialFen);
  const [turn, setTurn] = useState<'w' | 'b'>(initialFen.split(' ')[1] as 'w' | 'b');

  /* ───────────────────────────────────────────────────────── event listeners */
  useEffect(() => {
    socket.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'update') {
        chessRef.current.load(msg.fen);
        setFen(msg.fen);
        setTurn(msg.fen.split(' ')[1] as 'w' | 'b');
      }
    };
  }, [socket]);

  /* ───────────────────────────────────────────────────────── drag handlers */
  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      // only allow if it's my move
      if (turn !== color) return false;

      const move = chessRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move == null) return false; // illegal
      setFen(chessRef.current.fen());

      // send UCI to backend
      socket.send(JSON.stringify({ type: 'move', move: sourceSquare + targetSquare }));
      return true;
    },
    [socket, turn, color],
  );

  /* ───────────────────────────────────────────────────────── square styles */
  const [moveSquares, setMoveSquares] = useState<Record<string, React.CSSProperties>>({});

  const onMouseOverSquare = (sq: string) => {
    if (turn !== color) return;
    const moves = chessRef.current.moves({ square: sq as any, verbose: true }) as any[];
    const highlights: Record<string, React.CSSProperties> = {};
    moves.forEach(m => { 
      highlights[m.to] = { 
        background: 'radial-gradient(circle, #ffde00 25%, transparent 26%)',
        borderRadius: '50%'
      }; 
    });
    setMoveSquares(highlights);
  };

  const onMouseOutSquare = () => setMoveSquares({});

  /* ───────────────────────────────────────────────────────── render board */
  return (
    <Chessboard
      id="SPRESSBoard"
      position={fen}
      boardOrientation={color === 'w' ? 'white' : 'black'}
      onPieceDrop={onPieceDrop}
      onMouseOverSquare={onMouseOverSquare}
      onMouseOutSquare={onMouseOutSquare}
      customSquareStyles={moveSquares}
      animationDuration={150}
      boardWidth={Math.min(window.innerWidth - 40, 480)}
      customDarkSquareStyle={{ backgroundColor: '#0053FF' }}   // SPRESS blue
      customLightSquareStyle={{ backgroundColor: '#FFD700' }} // SPRESS yellow
      customBoardStyle={{
        borderRadius: '8px',
        border: '4px solid #E01313'
      }}
      arePiecesDraggable={turn === color}
    />
  );
} 