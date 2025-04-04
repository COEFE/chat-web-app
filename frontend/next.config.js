/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during production builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Configure the output directory for Vercel
  output: 'standalone',
  
  // Ensure compatibility with Vercel deployment
  distDir: '.next',
}

module.exports = nextConfig
