import path from 'path';
import { fileURLToPath } from 'url';
import copyFilePlugin from 'copy-webpack-plugin';
import { createRequire } from 'module';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a require function for this module
const require = createRequire(import.meta.url);

// Directly resolve the worker file path
const pdfWorkerPath = require.resolve('pdfjs-dist/build/pdf.worker.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Configuration for pdf.js worker needed by unpdf

    // Copy the worker file to the public/static directory
    if (!isServer) { // Only copy for the client-side build
      config.plugins.push(
        new copyFilePlugin({
          patterns: [
            {
              from: pdfWorkerPath, // Use the directly resolved path
              to: path.join(__dirname, 'public', 'static', 'pdf.worker.js'), // Copy to public/static/pdf.worker.js
            },
          ],
        })
      );
    }

    return config;
  },
};

export default nextConfig;
