// frontend/jest.config.js
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Handle module aliases (adjust paths as needed)
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/context/(.*)$': '<rootDir>/src/context/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/types$': '<rootDir>/src/types/index.ts', // Correct path to types
    // Handle general CSS imports (modules and global)
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js', // Use a generic mock for non-module CSS
    // Mock specific react-pdf CSS imports
    'react-pdf/dist/esm/Page/AnnotationLayer.css': '<rootDir>/__mocks__/styleMock.js',
    'react-pdf/dist/esm/Page/TextLayer.css': '<rootDir>/__mocks__/styleMock.js',
    // Mock dynamic import for PDFViewer - Ensure this path matches your structure
    '^./PDFViewer$': '<rootDir>/src/components/dashboard/__mocks__/PDFViewerMock.js'
  },
  transform: {
    // Use babel-jest to transpile tests with the next/babel preset
    '^.+\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(jose|jwks-rsa)/)',
    '^.+\\.module\\.(css|sass|scss)$', // Already handled by moduleNameMapper
  ],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
};
