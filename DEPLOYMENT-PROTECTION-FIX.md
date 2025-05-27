# Fix Vercel Deployment Protection

## Issue
Your expense-ai deployment has Vercel's deployment protection enabled, blocking access to test OAuth.

## Current Protected URL
- https://expense-4q5zdgf6u-coefes-projects.vercel.app (has Vercel auth wall)

## How to Disable Deployment Protection

### Method 1: Vercel Dashboard
1. Go to: https://vercel.com/coefes-projects/expense-ai
2. Click **Settings** tab
3. Click **Deployment Protection** in the left sidebar
4. Turn OFF protection for production deployments
5. Save changes

### Method 2: Check if Password Protection is Set
1. In Vercel Dashboard → Settings → Environment Variables
2. Look for `VERCEL_PASSWORD` or similar
3. Remove any password protection variables

## Alternative: Test on chat-web-app (No Protection)
Your chat-web-app deployment should work without protection:
- https://chat-web-30ftkdni6-coefes-projects.vercel.app

## Steps to Test OAuth After Removing Protection
1. Remove Vercel deployment protection
2. Add these domains to Firebase Console:
   ```
   localhost
   coefes-projects.vercel.app
   expense-4q5zdgf6u-coefes-projects.vercel.app
   ```
3. Test OAuth login on the expense-ai URL

## Firebase Console Update Required
Have you added the domains to Firebase Console yet?
- Firebase Console: https://console.firebase.google.com/
- Project: expense-ai-production
- Authentication → Settings → Authorized domains
