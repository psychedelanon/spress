module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^../src/store/stats$': '<rootDir>/src/store/stats.ts'
  }
};
