-- Create statement_trackers table for tracking processed bank and credit card statements
CREATE TABLE IF NOT EXISTS statement_trackers (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL,
  statement_number VARCHAR(255) NOT NULL,
  statement_date DATE NOT NULL,
  last_four VARCHAR(4) NOT NULL,
  is_starting_balance BOOLEAN DEFAULT FALSE,
  processed_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_statement_trackers_account_id ON statement_trackers(account_id);
CREATE INDEX IF NOT EXISTS idx_statement_trackers_statement_number ON statement_trackers(statement_number);
CREATE INDEX IF NOT EXISTS idx_statement_trackers_last_four ON statement_trackers(last_four);
CREATE INDEX IF NOT EXISTS idx_statement_trackers_user_id ON statement_trackers(user_id);
CREATE INDEX IF NOT EXISTS idx_statement_trackers_is_starting_balance ON statement_trackers(is_starting_balance);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_statement_tracker_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_statement_tracker_timestamp
BEFORE UPDATE ON statement_trackers
FOR EACH ROW
EXECUTE PROCEDURE update_statement_tracker_timestamp();
