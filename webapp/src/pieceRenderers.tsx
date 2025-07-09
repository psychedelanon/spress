import React, { useMemo } from 'react';

// Preload chess piece images for better performance
const PIECE_NAMES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

// Preload images in the background
const preloadImages = () => {
  PIECE_NAMES.forEach(pieceName => {
    const img = new Image();
    img.src = `/pieces/${pieceName}.svg`;
  });
};

// Preload on module load
if (typeof window !== 'undefined') {
  preloadImages();
}

// Memoized piece renderer factory
const createPieceRenderer = (pieceName: string) => {
  return React.memo(({ squareWidth }: { squareWidth: number }) => {
    // Memoized image source
    const imageUrl = useMemo(() => `/pieces/${pieceName}.svg`, []);
    
    // Memoized styles
    const imageStyles = useMemo(() => ({
      width: squareWidth,
      height: squareWidth,
      transition: 'transform 0.15s ease-out',
      pointerEvents: 'none' as const,
      willChange: 'transform',
      backfaceVisibility: 'hidden' as const,
    }), [squareWidth]);

    // Memoized alt text
    const altText = useMemo(() => {
      const color = pieceName.charAt(0) === 'w' ? 'White' : 'Black';
      const piece = pieceName.charAt(1);
      const pieceNames: Record<string, string> = {
        'K': 'King', 'Q': 'Queen', 'R': 'Rook', 
        'B': 'Bishop', 'N': 'Knight', 'P': 'Pawn'
      };
      return `${color} ${pieceNames[piece] || piece}`;
    }, []);
    
    return (
      <img 
        src={imageUrl}
        draggable={false}
        style={imageStyles}
        alt={altText}
        loading="eager"
        decoding="async"
        onError={(e) => {
          console.error(`❌ Failed to load piece: ${imageUrl}`);
          console.log('Falling back to default pieces');
          // Fallback to Unicode character or hide
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
        onLoad={() => {
          console.log(`✅ Successfully loaded: ${imageUrl}`);
        }}
      />
    );
  });
};

// Create memoized custom pieces object for react-chessboard
export const STABLE_PIECE_RENDERERS = {
  wK: createPieceRenderer('wK'),
  wQ: createPieceRenderer('wQ'),
  wR: createPieceRenderer('wR'),
  wB: createPieceRenderer('wB'),
  wN: createPieceRenderer('wN'),
  wP: createPieceRenderer('wP'),
  bK: createPieceRenderer('bK'),
  bQ: createPieceRenderer('bQ'),
  bR: createPieceRenderer('bR'),
  bB: createPieceRenderer('bB'),
  bN: createPieceRenderer('bN'),
  bP: createPieceRenderer('bP')
}; 