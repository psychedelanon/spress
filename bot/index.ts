import { Telegraf } from 'telegraf';
import axios from 'axios';

const token = process.env.TELE_TOKEN!;
const api = process.env.API_URL || 'http://localhost:3000';
const bot = new Telegraf(token);

bot.command('spress', async (ctx) => {
  const resp = await axios.post(`${api}/create`);
  const roomId = resp.data.roomId;
  const url = `https://t.me/${ctx.me}?start=room_${roomId}`;
  await ctx.reply('Play Spress', {
    reply_markup: { inline_keyboard: [[{ text: 'Play Spress', url }]] }
  });
});

bot.start(async (ctx) => {
  const payload = ctx.startPayload; // e.g. room_<id>
  if (payload?.startsWith('room_')) {
    const roomId = payload.substring(5);
    await axios.post(`${api}/join`, { roomId, tgUser: ctx.from });
    const link = `${process.env.PUBLIC_URL || api}/webapp/?roomId=${roomId}`;
    await ctx.reply(`Joined room ${roomId}`, {
      reply_markup: { inline_keyboard: [[{ text: 'Open board', web_app: { url: link } }]] }
    });
  } else {
    ctx.reply('Send /spress in a chat to create a game.');
  }
});

export default bot;

if (require.main === module) {
  bot.launch().then(() => console.log('Bot started'));
}
