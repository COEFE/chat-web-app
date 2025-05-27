#!/bin/bash
# Script to remove sensitive files from Git history

echo "🔒 Starting security cleanup..."

# Add files to .gitignore first to prevent re-adding
echo "Adding sensitive files to .gitignore..."
cat >> .gitignore << EOL

# Sensitive configuration files
production-firebase-config.md
env-production-template.txt
VERCEL-ENV-VARIABLES.md
EOL

# Remove the files from git history
echo "Removing sensitive files from Git history..."
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch production-firebase-config.md env-production-template.txt VERCEL-ENV-VARIABLES.md" \
  --prune-empty --tag-name-filter cat -- --all

# Force garbage collection and remove old refs
echo "Cleaning up Git repository..."
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "🔐 Security cleanup complete!"
echo ""
echo "⚠️ IMPORTANT: You need to force push these changes to GitHub:"
echo "git push origin --force"
echo ""
echo "⚠️ WARNING: This will rewrite Git history. Make sure all team members are aware."
echo ""
echo "⚠️ YOU MUST STILL CHANGE YOUR DATABASE PASSWORD since it was exposed!"
echo "Log into your Neon dashboard and change the password for neondb_owner."
