import React, { useEffect, useState } from 'react';
import { ChessBoardView } from './ChessBoardView';
import { TelegramBridge } from './TelegramBridge';
import './App.css';

function App() {
  const [sessionId, setSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Initialize Telegram Web App
    const telegram = TelegramBridge.getInstance();
    
    // Get session ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = urlParams.get('sessionId');
    
    if (sessionIdFromUrl) {
      setSessionId(sessionIdFromUrl);
      setLoading(false);
    } else {
      // For development, create a mock session ID
      if (!telegram.isAvailable()) {
        const mockSessionId = `dev_session_${Date.now()}`;
        setSessionId(mockSessionId);
        setLoading(false);
      } else {
        setError('No session ID provided');
        setLoading(false);
      }
    }
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: 'var(--tg-bg-color, #ffffff)',
        color: 'var(--tg-text-color, #000000)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #0088cc',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          <div>Loading TeleChess...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems:'center', 
        height: '100vh',
        backgroundColor: 'var(--tg-bg-color, #ffffff)',
        color: 'var(--tg-text-color, #000000)',
        padding: '20px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>❌ Error</h2>
          <p>{error}</p>
          <p style={{ fontSize: '12px', color: '#666' }}>
            This Mini App should be opened from a Telegram chess game.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: 'var(--tg-bg-color, #ffffff)',
      minHeight: '100vh'
    }}>
      <ChessBoardView sessionId={sessionId} />
      
      {/* Add spinning animation CSS */}
      <style>
        {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        `}
      </style>
    </div>
  );
}

export default App;
