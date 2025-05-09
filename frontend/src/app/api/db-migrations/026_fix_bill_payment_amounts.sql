-- Migration to fix bill payment amounts where payments were recorded correctly but
-- bill status and amounts were not updated properly due to string/number conversion issues

-- Update bill ID 3 (the Amazon bill) to set it as fully paid with the correct amount
UPDATE bills
SET amount_paid = '500.00', 
    status = 'Paid',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 3;

-- Print verification of the update
SELECT id, bill_number, total_amount, amount_paid, status 
FROM bills
WHERE id = 3;
