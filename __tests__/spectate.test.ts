import { registerSpectateHandler } from '../src/telechess/commands';

test('spectate button replies with spectator link', async () => {
  const bot = { action: jest.fn() } as any;
  registerSpectateHandler(bot);
  expect(bot.action).toHaveBeenCalled();
  const [regex, handler] = bot.action.mock.calls[0];
  expect(String(regex)).toBe('/^spectate_(.+)/');
  const ctx = {
    match: ['spectate_abc', 'abc'],
    answerCbQuery: jest.fn(),
    reply: jest.fn()
  } as any;
  process.env.WEBAPP_URL = 'https://example.com/webapp';
  await handler(ctx);
  expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('spectator=1'));
});
