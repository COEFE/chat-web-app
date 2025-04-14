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

  // This is the key configuration for Vercel function timeouts
  // It will be picked up by Vercel during deployment
  env: {
    VERCEL_FUNCTIONS_TIMEOUT: '60',
  },
}

module.exports = nextConfig
