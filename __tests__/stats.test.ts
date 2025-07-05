const { initStats, updateStats, getStats } = require('../src/store/stats');

describe('stats', () => {
  it('increments PvP wins for white', () => {
    initStats();
    updateStats(1, 2, 'white', 'pvp', 123);
    expect(getStats(1).pvpWins).toBe(1);
    expect(getStats(2).pvpLosses).toBe(1);
  });
  it('updates ratings after two games', () => {
    initStats();
    updateStats(1, 2, 'white', 'pvp', 1);
    updateStats(1, 2, 'white', 'pvp', 1);
    expect(getStats(1).rating).toBeGreaterThan(getStats(2).rating);
  });
});
