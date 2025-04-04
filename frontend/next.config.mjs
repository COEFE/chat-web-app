import path from 'path';
import { fileURLToPath } from 'url';
import copyFilePlugin from 'copy-webpack-plugin';
import { createRequire } from 'module';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a require function for this module
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Configuration for pdf.js worker
    // Find the pdfjs-dist directory using the created require function
    const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json')); // Use require.resolve to get the path string
    const pdfWorkerPath = path.join(pdfjsDistPath, 'build', 'pdf.worker.js');

    // Copy the worker file to the static directory
    // Needs copy-webpack-plugin
    if (!isServer) { // Only copy for the client-side build
      config.plugins.push(
        new copyFilePlugin({
          patterns: [
            {
              from: pdfWorkerPath,
              to: path.join(__dirname, 'public'), // Copy to public folder
            },
          ],
        })
      );
    }

    // // Optional: If you still face issues, tell pdf.js where to find the worker
    // // This might require adjusting how you use the pdf.js-extract library
    // config.resolve.alias['pdfjs-dist/build/pdf.worker.entry.js'] = path.join(pdfjsDistPath, 'build', 'pdf.worker.js');


    // Important: return the modified config
    return config;
  },
};

export default nextConfig;
