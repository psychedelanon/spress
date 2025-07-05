// Simple function-based piece renderers for react-chessboard compatibility
const createPieceRenderer = (pieceName: string) => {
  return ({ squareWidth }: { squareWidth: number }) => {
    // Correct path for production - pieces are served from public/pieces/
    const imageUrl = `/pieces/${pieceName}.svg`;
    
    return (
      <img 
        src={imageUrl}
        draggable={false}
        style={{ 
          width: squareWidth, 
          height: squareWidth,
          transition: 'transform 0.15s ease-out',
          pointerEvents: 'none',
        }}
        alt={`${pieceName.charAt(0) === 'w' ? 'White' : 'Black'} ${pieceName.charAt(1)}`}
        onError={(e) => {
          console.error(`❌ Failed to load piece: ${imageUrl}`);
          console.log('Falling back to default pieces');
        }}
        onLoad={() => {
          console.log(`✅ Successfully loaded: ${imageUrl}`);
        }}
      />
    );
  };
};

// Create custom pieces object for react-chessboard
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