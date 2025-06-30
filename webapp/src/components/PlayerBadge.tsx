import React from 'react';

interface PlayerBadgeProps {
  pfp: string;
  srcName: string;
  score: number;
  color: 'white' | 'black';
}

export default function PlayerBadge({ pfp, srcName, score, color }: PlayerBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <img src={pfp} alt={srcName} className="w-8 h-8 rounded-full" />
      <span className="font-semibold">{srcName}</span>
      <span className="text-sm">{score}</span>
      <span className={`px-1 rounded text-xs ${color === 'white' ? 'bg-gray-200' : 'bg-gray-700 text-white'}`}>{color}</span>
    </div>
  );
}
