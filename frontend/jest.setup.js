// frontend/jest.setup.js
import '@testing-library/jest-dom';

// Polyfill fetch for Jest environment
require('cross-fetch/polyfill');
// Polyfill TextEncoder/TextDecoder for ESM modules
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
