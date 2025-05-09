-- CRM Setup Migration
-- This migration creates the necessary tables for the CRM functionality

-- Contact roles table
CREATE TABLE IF NOT EXISTS contact_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table (extending customer information)
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  job_title VARCHAR(100),
  role_id INTEGER REFERENCES contact_roles(id),
  is_primary BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on customer_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_contacts_customer_id ON contacts(customer_id);

-- Create unique index to enforce only one primary contact per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_primary_per_customer 
ON contacts(customer_id) 
WHERE is_primary = TRUE;

-- Pipeline stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  color VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  primary_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  stage_id VARCHAR(50) NOT NULL,
  value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 0,
  expected_close_date DATE,
  closed_at TIMESTAMP WITH TIME ZONE,
  won BOOLEAN,
  assigned_to VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for opportunities
CREATE INDEX IF NOT EXISTS idx_opportunities_customer_id ON opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage_id ON opportunities(stage_id);

-- Activity types table
CREATE TABLE IF NOT EXISTS activity_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Activities/tasks table
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  activity_type_id INTEGER REFERENCES activity_types(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  priority VARCHAR(20) DEFAULT 'medium',
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  assigned_to VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for activities
CREATE INDEX IF NOT EXISTS idx_activities_customer_id ON activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_opportunity_id ON activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_activities_due_date ON activities(due_date);

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for each table
CREATE TRIGGER update_contact_roles_modtime
BEFORE UPDATE ON contact_roles
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_contacts_modtime
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_pipeline_stages_modtime
BEFORE UPDATE ON pipeline_stages
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_opportunities_modtime
BEFORE UPDATE ON opportunities
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_activity_types_modtime
BEFORE UPDATE ON activity_types
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_activities_modtime
BEFORE UPDATE ON activities
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Seed data for pipeline stages
INSERT INTO pipeline_stages (name, description, display_order, color, is_active)
VALUES 
  ('Lead', 'Initial contact', 1, 'blue', TRUE),
  ('Qualified', 'Qualified prospect', 2, 'purple', TRUE),
  ('Proposal', 'Proposal sent', 3, 'amber', TRUE),
  ('Negotiation', 'In negotiation', 4, 'orange', TRUE),
  ('Closed Won', 'Deal won', 5, 'green', TRUE),
  ('Closed Lost', 'Deal lost', 6, 'red', TRUE)
ON CONFLICT DO NOTHING;

-- Seed data for activity types
INSERT INTO activity_types (name, description, icon)
VALUES 
  ('Call', 'Phone call with customer', 'phone'),
  ('Email', 'Email correspondence', 'mail'),
  ('Meeting', 'In-person or virtual meeting', 'users'),
  ('Follow-up', 'Follow-up on previous interaction', 'repeat'),
  ('Task', 'Generic task', 'check-square')
ON CONFLICT DO NOTHING;

-- Seed data for contact roles
INSERT INTO contact_roles (name, description)
VALUES 
  ('Decision Maker', 'Can make purchase decisions'),
  ('Influencer', 'Influences decisions'),
  ('End User', 'Uses the product/service'),
  ('Technical Contact', 'Handles technical aspects'),
  ('Billing Contact', 'Handles billing and payments')
ON CONFLICT DO NOTHING;
