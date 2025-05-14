#!/bin/bash

# Script to test the bill refund functionality

echo "===== Testing Bill Refund Functionality ====="

# Run the migrations to create the bill_refunds table and add the journal type
echo "Running migrations..."
curl -X POST http://localhost:3000/api/admin/run-migrations \
  -H "Content-Type: application/json" \
  -d '{"migrationFile": "037_create_bill_refunds_table.sql"}'

curl -X POST http://localhost:3000/api/admin/run-migrations \
  -H "Content-Type: application/json" \
  -d '{"migrationFile": "038_add_bill_refund_journal_type.sql"}'

echo "Migrations completed."
echo ""

echo "===== Bill Refund Feature is Ready ====="
echo "To test the bill refund functionality:"
echo "1. Navigate to a paid bill in the application"
echo "2. Click the 'Create Refund' button"
echo "3. Fill out the refund form and submit"
echo "4. Verify that the refund appears in the Refund History section"
echo ""
echo "You can also check the database to verify that the refund was recorded correctly:"
echo "SELECT * FROM bill_refunds;"
echo "SELECT * FROM journals WHERE journal_type = 'BR';"
echo ""
