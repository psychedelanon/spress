import fs from 'fs';
import path from 'path';

export interface PlayerStats {
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  soloWins: number;
  soloLosses: number;
  soloDraws: number;
}

const statsPath = path.join(__dirname, 'stats.json');
let stats: Record<string, PlayerStats> = {};

export function loadStats() {
  try {
    if (fs.existsSync(statsPath)) {
      stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')) as Record<string, PlayerStats>;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

export function saveStats() {
  try {
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error('Failed to save stats:', err);
  }
}

loadStats();

function ensureUser(id: number) {
  if (!stats[id]) {
    stats[id] = {
      pvpWins: 0,
      pvpLosses: 0,
      pvpDraws: 0,
      soloWins: 0,
      soloLosses: 0,
      soloDraws: 0
    };
  }
}

export function recordResult(whiteId: number, blackId: number, result: 'white'|'black'|'draw', mode: 'pvp'|'ai') {
  ensureUser(whiteId);
  ensureUser(blackId);
  if (mode === 'pvp') {
    if (result === 'white') {
      stats[whiteId].pvpWins++;
      stats[blackId].pvpLosses++;
    } else if (result === 'black') {
      stats[blackId].pvpWins++;
      stats[whiteId].pvpLosses++;
    } else {
      stats[whiteId].pvpDraws++;
      stats[blackId].pvpDraws++;
    }
  } else {
    // solo mode: whiteId is human, blackId is AI (-1)
    if (result === 'white') stats[whiteId].soloWins++;
    else if (result === 'black') stats[whiteId].soloLosses++;
    else stats[whiteId].soloDraws++;
  }
  saveStats();
}

export function getStats(userId: number): PlayerStats {
  ensureUser(userId);
  return stats[userId];
}
