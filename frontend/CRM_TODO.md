# Basic CRM Implementation Plan

## Overview
This document outlines the implementation of a basic Customer Relationship Management (CRM) system that integrates with the existing Accounts Receivable functionality. The CRM will help manage customer interactions, track opportunities, and provide tools for better customer engagement.

## Feature Roadmap

### Phase 1: Core CRM Structure
- [x] Customer Management (Already implemented in Accounts Receivable)
- [ ] CRM Dashboard
  - [ ] Activity overview
  - [ ] Recent contacts
  - [ ] Upcoming tasks
  - [ ] Performance metrics
- [ ] Contact Management (extending current customer data)
  - [ ] Additional contact fields (roles, social profiles)
  - [ ] Contact history
  - [ ] Activity logging
  - [ ] Multiple contacts per customer

### Phase 2: Sales Pipeline
- [ ] Opportunity Management
  - [ ] Pipeline stages (Lead, Qualified, Proposal, Negotiation, Closed Won/Lost)
  - [ ] Opportunity value tracking
  - [ ] Win/loss reporting
- [ ] Quotes and Proposals
  - [ ] Quote generation (based on existing invoice system)
  - [ ] Proposal templates
  - [ ] Digital signature integration
- [ ] Sales Goals and Forecasting
  - [ ] Goal setting interface
  - [ ] Forecasting tools
  - [ ] Performance dashboards

### Phase 3: Customer Engagement
- [ ] Task Management
  - [ ] Create/assign tasks
  - [ ] Task reminders
  - [ ] Task completion tracking
- [ ] Email Integration
  - [ ] Template-based emails
  - [ ] Email tracking (opens, clicks)
  - [ ] Email scheduling
- [ ] Customer Support
  - [ ] Case management
  - [ ] Support ticket system
  - [ ] SLA tracking

## Database Schema Extensions

```sql
-- Contact extensions (beyond existing customer table)
CREATE TABLE IF NOT EXISTS contact_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  role_id INTEGER REFERENCES contact_roles(id),
  is_primary BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Pipeline management
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  stage_id INTEGER NOT NULL REFERENCES pipeline_stages(id),
  estimated_value DECIMAL(15, 2),
  probability INTEGER,
  expected_close_date DATE,
  assigned_to VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE,
  won BOOLEAN
);

-- Activity tracking
CREATE TABLE IF NOT EXISTS activity_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  activity_type_id INTEGER REFERENCES activity_types(id),
  customer_id INTEGER REFERENCES customers(id),
  contact_id INTEGER REFERENCES contacts(id),
  opportunity_id INTEGER REFERENCES opportunities(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  assigned_to VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Technical Implementation

### Directory Structure
```
/src
  /app
    /dashboard
      /crm
        /page.tsx                   # CRM Dashboard
        /customers
          /page.tsx                 # Customer list (enhanced from AR)
          /[id]/page.tsx            # Customer detail view
        /contacts
          /page.tsx                 # Contacts list
          /[id]/page.tsx            # Contact detail view
        /opportunities
          /page.tsx                 # Opportunities list
          /[id]/page.tsx            # Opportunity detail view
        /activities
          /page.tsx                 # Activity list and calendar
        /reports
          /page.tsx                 # CRM reports and analytics
  /components
    /crm
      /CustomerProfile.tsx          # Enhanced customer view
      /ContactsList.tsx             # Contacts management component
      /OpportunityKanban.tsx        # Kanban board for opportunities
      /ActivityTimeline.tsx         # Activity timeline component
      /DashboardMetrics.tsx         # Dashboard metrics and charts
      /TaskManagement.tsx           # Task creation and management
      /CrmNavigation.tsx            # CRM navigation menu
```

### Implementation Plan

1. **Foundation**
   - Extend customer data model with CRM-specific fields
   - Create basic CRM dashboard with navigation
   - Implement contact management
   - Build activity logging system

2. **Sales Process**
   - Build opportunity management with pipeline stages
   - Create kanban board for visual pipeline management
   - Implement basic forecasting and reporting
   - Integrate with existing invoice system for quotes/proposals

3. **Engagement**
   - Develop task management system
   - Create email template system
   - Implement follow-up reminders
   - Add customer support ticket tracking

### UI Components (using Shadcn UI & Tailwind)

- Dashboard cards for key metrics
- Timeline component for activity tracking
- Kanban board for opportunity pipeline
- Calendar view for tasks and follow-ups
- Form components for data entry
- Table components for data display
- Modal dialogs for quick actions
- Charts for performance visualization

### API Routes

```typescript
// Customer endpoints
GET/POST /api/crm/customers           # List/create customers
GET/PUT/DELETE /api/crm/customers/:id # Manage specific customer

// Contact endpoints
GET/POST /api/crm/contacts            # List/create contacts
GET/PUT/DELETE /api/crm/contacts/:id  # Manage specific contact

// Opportunity endpoints
GET/POST /api/crm/opportunities       # List/create opportunities
GET/PUT/DELETE /api/crm/opportunities/:id # Manage specific opportunity

// Activity endpoints
GET/POST /api/crm/activities          # List/create activities
GET/PUT/DELETE /api/crm/activities/:id # Manage specific activity

// Pipeline endpoints
GET/POST /api/crm/pipeline-stages     # Manage pipeline stages

// Dashboard endpoints
GET /api/crm/dashboard/metrics        # Get dashboard metrics
GET /api/crm/dashboard/activities     # Get recent activities
```

## Integration Points

- **Accounts Receivable**: Use existing customer data and enhance with CRM capabilities
- **Invoicing**: Convert opportunities to invoices when deals are won
- **Reporting**: Incorporate sales data into financial reporting
- **User Management**: Integrate with existing user system for assignment and permissions

## Next Steps

1. Create database migrations for CRM tables
2. Build basic CRM dashboard UI
3. Extend customer views with CRM capabilities
4. Implement contact management
5. Develop opportunity pipeline management
