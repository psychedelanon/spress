import { memo, useState } from 'react';

// Create memoized piece component factory - these will have stable identity
const createStablePieceComponent = (pieceName: string) => {
  return memo(({ squareWidth, isDragging }: { squareWidth: number; isDragging?: boolean }) => {
    const [error, setError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    
    if (error && retryCount > 1) {
      // Fallback: return null to use default pieces after 2 retries
      console.log(`Failed to load ${pieceName} after retries, using default`);
      return null;
    }
    
    // Add cache busting only on retries - respect Vite base path and use SVG
    const cacheBust = retryCount > 0 ? `?t=${Date.now()}&retry=${retryCount}` : '';
    const imageUrl = `${import.meta.env.BASE_URL}pieces/${pieceName}.svg${cacheBust}`;
    
    return (
      <img 
        src={imageUrl}
        draggable={false}
        style={{ 
          width: squareWidth, 
          height: squareWidth,
          transition: 'transform 0.15s ease-out',
          pointerEvents: 'none',
          // Nice little halo while dragging
          filter: isDragging ? 'drop-shadow(0 0 4px rgba(0,0,0,.6))' : undefined,
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
  });
};

// Create stable custom pieces object at module scope - identity NEVER changes
export const STABLE_PIECE_RENDERERS = {
  wK: createStablePieceComponent('wK'),
  wQ: createStablePieceComponent('wQ'),
  wR: createStablePieceComponent('wR'),
  wB: createStablePieceComponent('wB'),
  wN: createStablePieceComponent('wN'),
  wP: createStablePieceComponent('wP'),
  bK: createStablePieceComponent('bK'),
  bQ: createStablePieceComponent('bQ'),
  bR: createStablePieceComponent('bR'),
  bB: createStablePieceComponent('bB'),
  bN: createStablePieceComponent('bN'),
  bP: createStablePieceComponent('bP')
} as const; 