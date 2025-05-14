#!/bin/bash

# Test script for AP Agent Memory System
echo "Starting AP Agent Memory System Test"
echo "-----------------------------------"

# 1. Run the migration to create the statement_trackers table
echo "Step 1: Running migration to create statement_trackers table..."
curl -X POST http://localhost:3000/api/db-migrations/run \
  -H "Content-Type: application/json" \
  -d '{"migrationFile": "012_create_statement_trackers_table.sql"}' \
  -v

echo ""
echo "-----------------------------------"

# 2. Process a statement using the TestAPAgentMemoryButton component
echo "Step 2: Testing statement processing..."
echo "Please use the TestAPAgentMemoryButton component in the Admin page to process a statement."
echo "Enter the following information:"
echo "  - Statement Number: STMT-123456"
echo "  - Account Name: Business Checking"
echo "  - Statement Date: $(date +%Y-%m-%d)"
echo "  - Balance: 1000.00"
echo ""
echo "Click 'Process Statement' and then 'Test Memory' to verify that the AP Agent remembers the statement."
echo ""
echo "-----------------------------------"

echo "Test complete. Check the logs in the TestAPAgentMemoryButton component for results."
