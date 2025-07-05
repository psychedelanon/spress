import ChessImageGenerator from 'chess-image-generator';
import { fenToPng } from '../src/render/boardImage';

jest.mock('chess-image-generator');

test('caches board images', async () => {
  const mock = {
    loadFEN: jest.fn(),
    generatePNGBuffer: jest.fn().mockResolvedValue(Buffer.from('img'))
  };
  (ChessImageGenerator as unknown as jest.Mock).mockImplementation(() => mock);

  await fenToPng('start');
  await fenToPng('start');

  expect(mock.loadFEN).toHaveBeenCalledTimes(1);
  expect(mock.generatePNGBuffer).toHaveBeenCalledTimes(1);
});
