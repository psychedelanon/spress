module.exports = jest.fn().mockImplementation(() => ({
  loadFEN: jest.fn(),
  generatePNGBuffer: jest.fn().mockResolvedValue(Buffer.from('mock'))
}));
