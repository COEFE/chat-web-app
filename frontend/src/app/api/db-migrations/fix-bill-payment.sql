-- Update the bill with ID 3 to mark it as fully paid
UPDATE bills
SET amount_paid = '500.00', 
    status = 'Paid',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 3;

-- Verify the update
SELECT id, bill_number, total_amount, amount_paid, status 
FROM bills
WHERE id = 3;
