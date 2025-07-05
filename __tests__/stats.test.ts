const { initStats, updateStats, getStats } = require('../src/store/stats');

describe('stats', () => {
  it('increments PvP wins for white', () => {
    initStats();
    updateStats(1, 2, 'white', 'pvp');
    expect(getStats(1).pvpWins).toBe(1);
    expect(getStats(2).pvpLosses).toBe(1);
  });
});
