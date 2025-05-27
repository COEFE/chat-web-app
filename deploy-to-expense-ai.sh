#!/bin/bash
# Deploy to expense-ai project specifically

echo "Removing existing Vercel configuration..."
rm -rf .vercel

echo "Creating fresh deployment to expense-ai project..."
# This will prompt to select the project
echo "When prompted:"
echo "1. Select scope: coefes-projects"
echo "2. Select project: expense-ai"
echo "3. Link to existing project: Y"

echo ""
echo "Running vercel deploy..."
vercel --prod --scope coefes-projects
