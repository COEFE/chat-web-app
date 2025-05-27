# Dual Repository Setup for ExpenseAI

## 🎯 Strategy: One Codebase, Two Deployment Targets

### Current Setup:
- **Main Development Repo**: `COEFE/chat-web-app` (full accounting system)
- **Consumer Product Repo**: `COEFE/expense-ai` (MVP feature-flagged version)

### Setup Commands:

```bash
# 1. Create new GitHub repo for consumer product
# Go to GitHub.com and create: COEFE/expense-ai

# 2. Add it as a second remote
git remote add consumer https://github.com/COEFE/expense-ai.git

# 3. Verify both remotes
git remote -v
# Should show:
# origin    https://github.com/COEFE/chat-web-app.git (fetch)
# origin    https://github.com/COEFE/chat-web-app.git (push)
# consumer  https://github.com/COEFE/expense-ai.git (fetch)
# consumer  https://github.com/COEFE/expense-ai.git (push)

# 4. Push to both repos
git push origin main          # Full development version
git push consumer main        # Same code, deployed with MVP flags
```

### Daily Workflow:

```bash
# Make changes to your code
git add .
git commit -m "Enhanced receipt processing with AI"

# Push to both repositories
git push origin main      # Development repo (full features)
git push consumer main    # Consumer repo (MVP features)

# Or push to both at once:
git push origin main && git push consumer main
```

### Environment-Based Deployment:

**Development Repo (`chat-web-app`):**
```env
# .env.production (Vercel deployment)
NEXT_PUBLIC_PRODUCT_TIER=enterprise
NEXT_PUBLIC_APP_NAME=AccountingAI Pro
```

**Consumer Repo (`expense-ai`):**
```env
# .env.production (Vercel deployment) 
NEXT_PUBLIC_PRODUCT_TIER=mvp
NEXT_PUBLIC_APP_NAME=ExpenseAI
```

### Benefits:
✅ **Single Codebase**: No duplicate code maintenance
✅ **Separate Deployments**: Different environments and configurations
✅ **Independent Versioning**: Can tag releases separately
✅ **Clear Separation**: Development vs Consumer product
✅ **Easy Updates**: One commit updates both repos

### Alternative: Automated Push Script

Create a script to push to both repos automatically:

```bash
#!/bin/bash
# save as: push-to-both.sh

echo "Pushing to development repo..."
git push origin main

echo "Pushing to consumer repo..."  
git push consumer main

echo "✅ Pushed to both repositories!"
```

Then just run: `./push-to-both.sh`
