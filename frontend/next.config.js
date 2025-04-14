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

  // Configure serverless functions for extended timeouts
  experimental: {
    serverComponentsExternalPackages: ['xlsx'],
  },
  
  // Configure Vercel serverless function settings
  serverRuntimeConfig: {
    // This will be available on the server side
    PROJECT_ROOT: __dirname,
  },
}

module.exports = nextConfig
