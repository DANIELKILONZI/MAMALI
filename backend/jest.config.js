/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Run each file in its own isolated context
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Integration tests need longer timeout because they hit SQLite
  testTimeout: 15000,
  // Show verbose output per test
  verbose: true,
  // Separate setup for unit vs integration (helpers mounted per-suite in beforeAll)
  globalTeardown: undefined,
};
