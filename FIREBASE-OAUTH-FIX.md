# Firebase OAuth Redirect Fix

## Current Issue
Your OAuth is failing because Firebase doesn't recognize your current Vercel deployment domains.

## Current Project URLs
- **expense-ai project**: `https://expense-ai-git-main-coefes-projects.vercel.app`
- **chat-web-app project**: `https://chat-web-bqn7se4na-coefes-projects.vercel.app` (current deployment)

## Steps to Fix in Firebase Console

### 1. Go to Firebase Console
1. Visit: https://console.firebase.google.com/
2. Select your project: **expense-ai-production**

### 2. Navigate to Authentication Settings
1. Click **Authentication** in the left sidebar
2. Click **Settings** tab
3. Click **Authorized domains** section

### 3. Add Required Domains
Add these domains to your authorized domains list:

```
localhost
coefes-projects.vercel.app
expense-ai.vercel.app
chat-web-app.vercel.app
expense-ai-git-main-coefes-projects.vercel.app
```

**Important**: The domain `coefes-projects.vercel.app` will cover ALL your Vercel deployments with patterns like:
- `expense-ai-[random]-coefes-projects.vercel.app`
- `chat-web-[random]-coefes-projects.vercel.app`

### 4. Configure OAuth Redirect URIs (if using Google Sign-In)
If you're using Google OAuth, also check:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **expense-ai-production**
3. Navigate to **APIs & Services** > **Credentials**
4. Click on your OAuth 2.0 Client ID
5. In **Authorized redirect URIs**, add:

```
https://coefes-projects.vercel.app/__/auth/handler
https://expense-ai.vercel.app/__/auth/handler
https://chat-web-app.vercel.app/__/auth/handler
http://localhost:3000/__/auth/handler
```

### 5. Test the Fix
After making these changes:
1. Wait 5-10 minutes for changes to propagate
2. Try logging in again on your production URL
3. Check browser console for any remaining errors

## Code Changes Made
- Updated `authDomainConfig.ts` to include both `expense-ai` and `chat-web-app` patterns
- Added `coefes-projects.vercel.app` to cover all deployment variations

## Which Project Should You Use?
- **expense-ai**: `https://expense-ai-git-main-coefes-projects.vercel.app`
- **chat-web-app**: Currently deploying new version

Choose the `expense-ai` project if that's your main production app.

## Verification
To verify the fix is working:
1. Open browser dev tools
2. Go to your chosen production URL
3. Check console logs for "Is authorized: true"
4. Attempt OAuth login

## If Still Not Working
1. Check Firebase Console for any error logs
2. Verify the project ID matches in both Firebase and your environment variables
3. Ensure your API keys are correctly set in Vercel environment variables
