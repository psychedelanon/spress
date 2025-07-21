"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStats = exports.seenChats = void 0;
exports.loadStats = loadStats;
exports.saveStats = saveStats;
exports.saveStatsPeriodically = saveStatsPeriodically;
exports.stopStatsInterval = stopStatsInterval;
exports.initStats = initStats;
exports.recordResult = recordResult;
exports.getStats = getStats;
exports.getAllStats = getAllStats;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Store stats outside the source folder if a /data volume is present to avoid
// conflicts with the TypeScript module resolution.  When running locally
// without the volume, keep the file next to this module but use a different
// filename so Node does not load it instead of the .ts file.
const statsPath = fs_1.default.existsSync('/data')
    ? '/data/stats.json'
    : path_1.default.join(__dirname, 'stats.store.json');
let stats = {};
let saveInterval = null;
exports.seenChats = new Set();
function loadStats() {
    try {
        if (fs_1.default.existsSync(statsPath)) {
            stats = JSON.parse(fs_1.default.readFileSync(statsPath, 'utf8'));
        }
    }
    catch (err) {
        console.error('Failed to load stats:', err);
    }
}
function saveStats() {
    try {
        fs_1.default.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    }
    catch (err) {
        console.error('Failed to save stats:', err);
    }
}
function saveStatsPeriodically(intervalMs = 30000) {
    if (saveInterval)
        clearInterval(saveInterval);
    saveInterval = setInterval(saveStats, intervalMs);
}
function stopStatsInterval() {
    if (saveInterval)
        clearInterval(saveInterval);
}
loadStats();
function initStats() {
    stats = {};
}
function ensureUser(id) {
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
function applyElo(a, b, result) {
    const ea = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
    const sa = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
    a.rating = Math.round(a.rating + K * (sa - ea));
    b.rating = Math.round(b.rating + K * ((1 - sa) - (1 - ea)));
}
function recordResult(whiteId, blackId, result, mode, chatId) {
    ensureUser(whiteId);
    ensureUser(blackId);
    if (mode === 'pvp') {
        if (result === 'white') {
            stats[whiteId].pvpWins++;
            stats[blackId].pvpLosses++;
        }
        else if (result === 'black') {
            stats[blackId].pvpWins++;
            stats[whiteId].pvpLosses++;
        }
        else {
            stats[whiteId].pvpDraws++;
            stats[blackId].pvpDraws++;
        }
        applyElo(stats[whiteId], stats[blackId], result);
        if (chatId !== undefined) {
            exports.seenChats.add(chatId);
            if (!stats[whiteId].chats.includes(chatId))
                stats[whiteId].chats.push(chatId);
            if (!stats[blackId].chats.includes(chatId))
                stats[blackId].chats.push(chatId);
        }
    }
    else {
        // solo mode: whiteId is human, blackId is AI (-1)
        if (result === 'white')
            stats[whiteId].soloWins++;
        else if (result === 'black')
            stats[whiteId].soloLosses++;
        else
            stats[whiteId].soloDraws++;
        if (chatId !== undefined) {
            exports.seenChats.add(chatId);
            if (!stats[whiteId].chats.includes(chatId)) {
                stats[whiteId].chats.push(chatId);
            }
        }
    }
    saveStats();
}
exports.updateStats = recordResult;
function getStats(userId) {
    ensureUser(userId);
    return stats[userId];
}
function getAllStats() {
    return stats;
}
