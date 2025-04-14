/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during production builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Use the standard output format for Vercel
  // This is the default and works best with Vercel
  
  // Ensure compatibility with Vercel deployment
  distDir: '.next',

  // Use the updated configuration for external packages
  serverExternalPackages: ['xlsx'],
  
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
