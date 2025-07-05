const { withLock } = require('../src/utils/lock');

test('withLock executes sequentially', async () => {
  const result: number[] = [];
  await Promise.all([
    withLock('a', async () => { await new Promise(r => setTimeout(r, 50)); result.push(1); }),
    withLock('a', async () => { result.push(2); })
  ]);
  expect(result).toEqual([1,2]);
});
