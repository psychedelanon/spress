import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { Chessboard } from 'react-chessboard';
import ReconnectingWebSocket from 'reconnecting-websocket';
import './App.css';

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session')!;
const playerColor = params.get('color') as 'w' | 'b';

const wsBase = window.location.origin.replace(/^http/, 'ws');
const ws = new ReconnectingWebSocket(`${wsBase}/ws?session=${sessionId}&color=${playerColor}`);

export default function App() {
  const [fen, setFen] = useState('start');
  const [turn, setTurn] = useState<'w'|'b'>('w');
  const [status, setStatus] = useState('Connecting…');
  const playing = playerColor === turn;

  useEffect(() => {
    WebApp.ready(); 
    WebApp.expand();
    
    ws.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.type !== 'update') return;
      setFen(data.fen); 
      setTurn(data.turn);
      if (data.winner) {
        setStatus(`${data.winner} wins`);
      } else {
        setStatus(playing ? 'Your move' : 'Waiting…');
      }
    };
  }, [playing]);

  return (
    <div className="root">
      <header>SPRESS</header>
      <div className="board-wrap">
        <Chessboard
          position={fen}
          arePiecesDraggable={playing}
          onPieceDrop={(s, t) => {
            ws.send(JSON.stringify({ type:'move', move: s+t }));
            return true;
          }}
          boardWidth={Math.min(WebApp.viewportHeight - 140, 380)}
          customDarkSquareStyle={{ backgroundColor:'#0053FF' }}
          customLightSquareStyle={{ backgroundColor:'#FFD700' }}
          animationDuration={200}
        />
      </div>
      <p className="status">{status}</p>
    </div>
  );
}
