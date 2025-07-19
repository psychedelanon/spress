import ChessImageGenerator from 'chess-image-generator';
import { fenToPng } from '../src/render/boardImage';

const mockInstance = {
  loadFEN: jest.fn(),
  generatePNGBuffer: jest.fn().mockResolvedValue(Buffer.from('img'))
};

jest.mock('chess-image-generator', () => {
  return jest.fn(() => mockInstance);
}, { virtual: true });

test('caches board images', async () => {
  (ChessImageGenerator as unknown as jest.Mock).mockImplementation(() => mockInstance);

  await fenToPng('start');
  await fenToPng('start');

  expect(mockInstance.loadFEN).toHaveBeenCalledTimes(1);
  expect(mockInstance.generatePNGBuffer).toHaveBeenCalledTimes(1);
});
