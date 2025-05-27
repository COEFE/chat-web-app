#!/bin/bash

# Dual Repository Push Script
# Pushes changes to both development and consumer repos

echo "🚀 Pushing to both repositories..."
echo ""

# Get current branch name
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Push to development repo (full features)
echo "📋 Pushing to development repo (chat-web-app)..."
if git push origin $CURRENT_BRANCH; then
    echo "✅ Successfully pushed to development repo"
else
    echo "❌ Failed to push to development repo"
    exit 1
fi

echo ""

# Push to consumer repo (MVP features) - always push to main branch
echo "🏪 Pushing to consumer repo (expense-ai)..."
if git push consumer $CURRENT_BRANCH:main; then
    echo "✅ Successfully pushed to consumer repo"
else
    echo "❌ Failed to push to consumer repo"
    exit 1
fi

echo ""
echo "🎉 Successfully pushed to both repositories!"
echo "   - Development: Full accounting features enabled"
echo "   - Consumer: MVP expense tracking only"
