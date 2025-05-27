#!/bin/bash

# Firebase Project Switcher for ExpenseAI
# Usage: ./firebase-switch.sh [dev|prod]

if [ "$1" = "dev" ]; then
    echo "🔧 Switching to Development Firebase Project..."
    firebase use development
    echo "✅ Now using: web-chat-app-fa7f0 (Development)"
    echo "💡 Make sure your .env.local has development Firebase config"
elif [ "$1" = "prod" ]; then
    echo "🚀 Switching to Production Firebase Project..."
    firebase use production
    echo "✅ Now using: expense-ai-production (Production)"
    echo "💡 Make sure Vercel has production Firebase config"
else
    echo "📋 Current Firebase Project:"
    firebase use
    echo ""
    echo "🔄 Usage: ./firebase-switch.sh [dev|prod]"
    echo "   dev  - Switch to development project (web-chat-app-fa7f0)"
    echo "   prod - Switch to production project (expense-ai-production)"
    echo ""
    echo "📋 Available Projects:"
    echo "   development: web-chat-app-fa7f0"
    echo "   production: expense-ai-production"
fi
