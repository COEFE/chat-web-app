import path from 'path';
import { fileURLToPath } from 'url';
// We no longer need copy-webpack-plugin
import { createRequire } from 'module'; // Import createRequire

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a require function for this module
const require = createRequire(import.meta.url);

// pdf.worker.js should be handled automatically by unpdf

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove the webpack configuration entirely
};

export default nextConfig;
