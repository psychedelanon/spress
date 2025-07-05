import fs from 'fs';
import path from 'path';

export interface UserStats {
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  soloWins: number;
  soloLosses: number;
  soloDraws: number;
  rating: number;
  chats: number[];
}

const statsPath = path.join(__dirname, 'stats.json');
let stats: Record<string, UserStats> = {};
let saveInterval: NodeJS.Timeout | null = null;
export const seenChats = new Set<number>();

export function loadStats() {
  try {
    if (fs.existsSync(statsPath)) {
      stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')) as Record<string, UserStats>;
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

export function saveStatsPeriodically(intervalMs = 30000) {
  if (saveInterval) clearInterval(saveInterval);
  saveInterval = setInterval(saveStats, intervalMs);
}

export function stopStatsInterval() {
  if (saveInterval) clearInterval(saveInterval);
}

loadStats();

export function initStats() {
  stats = {};
}

function ensureUser(id: number) {
  if (!stats[id]) {
    stats[id] = {
      pvpWins: 0,
      pvpLosses: 0,
      pvpDraws: 0,
      soloWins: 0,
      soloLosses: 0,
      soloDraws: 0,
      rating: 1000,
      chats: []
    };
  }
}

const K = 32;
function applyElo(a: UserStats, b: UserStats, result: 'white' | 'black' | 'draw') {
  const ea = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
  const sa = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
  a.rating = Math.round(a.rating + K * (sa - ea));
  b.rating = Math.round(b.rating + K * ((1 - sa) - (1 - ea)));
}

export function recordResult(
  whiteId: number,
  blackId: number,
  result: 'white' | 'black' | 'draw',
  mode: 'pvp' | 'ai',
  chatId?: number
) {
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

    applyElo(stats[whiteId], stats[blackId], result);
    if (chatId !== undefined) {
      seenChats.add(chatId);
      if (!stats[whiteId].chats.includes(chatId)) stats[whiteId].chats.push(chatId);
      if (!stats[blackId].chats.includes(chatId)) stats[blackId].chats.push(chatId);
    }
  } else {
    // solo mode: whiteId is human, blackId is AI (-1)
    if (result === 'white') stats[whiteId].soloWins++;
    else if (result === 'black') stats[whiteId].soloLosses++;
    else stats[whiteId].soloDraws++;
    if (chatId !== undefined) {
      seenChats.add(chatId);
      if (!stats[whiteId].chats.includes(chatId)) {
        stats[whiteId].chats.push(chatId);
      }
    }
  }
  saveStats();
}

export const updateStats = recordResult;

export function getStats(userId: number): UserStats {
  ensureUser(userId);
  return stats[userId];
}

export function getAllStats() {
  return stats;
}
