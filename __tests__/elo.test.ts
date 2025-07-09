const { initStats, updateStats, getStats } = require('../src/store/stats');

it('increases winner rating', () => {
  initStats();
  updateStats(1, 2, 'white', 'pvp', 1);
  expect(getStats(1).rating).toBeGreaterThan(1000);
  expect(getStats(2).rating).toBeLessThan(1000);
});

export {};
