// Download PDF.js worker script to public directory
const fs = require('fs');
const path = require('path');
const https = require('https');

const version = '4.8.69'; // Match the version in package.json
const workerUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`;
const outputPath = path.resolve(__dirname, '../public/pdf.worker.min.js');

console.log(`Downloading PDF.js worker v${version} to public directory...`);

// Create the directory if it doesn't exist
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Download the file
https.get(workerUrl, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download worker: ${response.statusCode} ${response.statusMessage}`);
    process.exit(1);
  }

  const file = fs.createWriteStream(outputPath);
  response.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log(`PDF.js worker downloaded successfully to ${outputPath}`);
  });
}).on('error', (err) => {
  console.error(`Error downloading worker: ${err.message}`);
  process.exit(1);
});
