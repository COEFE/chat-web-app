// Copy PDF.js worker from node_modules to public directory
const fs = require('fs');
const path = require('path');

try {
  // Path to the minified worker file in node_modules
  // For pdfjs-dist 4.x
  const sourceWorkerPath = path.resolve(
    __dirname,
    '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs' // Use the minified version
  );

  // Output path in public directory, matching the component's expected name
  const outputPath = path.resolve(__dirname, '../public/pdf.worker.min.mjs'); // Keep .mjs extension

  console.log('Copying PDF.js worker (minified) to public directory...');
  console.log(`Source: ${sourceWorkerPath}`);
  console.log(`Destination: ${outputPath}`);

  // Check if source file exists
  if (!fs.existsSync(sourceWorkerPath)) {
    console.warn('Source worker file not found, skipping copy...');
    process.exit(0); // Exit successfully instead of failing
  }

  // Create the directory if it doesn't exist
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Copy the file
  fs.copyFileSync(sourceWorkerPath, outputPath);
  console.log('PDF.js worker copied successfully!');
} catch (error) {
  console.error('Error copying PDF.js worker:', error);
  console.warn('Continuing build without PDF.js worker...');
  process.exit(0); // Exit successfully to not fail the build
}
