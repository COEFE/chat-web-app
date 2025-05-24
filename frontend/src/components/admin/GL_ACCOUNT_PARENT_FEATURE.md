# GL Account Parent Selection Feature

## Overview

Added the ability to select a parent account when creating GL accounts in the agent test interface. This enhancement improves the chart of accounts organization by allowing proper hierarchical relationships between accounts.

## Implementation Details

### Frontend Changes

1. **Parent Account Dropdown**
   - Added a dropdown to select a parent account in the GL account creation form
   - Filtered accounts by type (only shows accounts of the same type as the one being created)
   - Included a "No parent" option for top-level accounts
   - Added loading state indicator while accounts are being fetched

2. **Account Type Integration**
   - When changing account type, the parent selection is reset
   - This ensures consistent parent-child relationships within the same account type
   - Improves data integrity in the chart of accounts

### Backend Changes

1. **API Endpoint**
   - Updated `/api/accounts/create-with-balance` to accept and process `parentId` parameter
   - Added proper handling of null values when no parent is selected

2. **Database Integration**
   - Modified the `createGLAccount` function to include `parent_id` in the SQL INSERT statement
   - Ensured proper type handling (number or null)
   - Maintained backward compatibility with existing code

## Benefits

1. **Improved Account Organization**
   - Enables proper hierarchical structure in the chart of accounts
   - Supports standard accounting practices for account grouping

2. **Better Financial Reporting**
   - Facilitates roll-up reporting by account hierarchy
   - Makes financial statements more organized and readable

3. **Enhanced User Experience**
   - Provides a more intuitive account creation process
   - Helps maintain consistent account structure

## Usage

1. Navigate to the Agent Tests page
2. Select the GL Agent tab
3. Fill in the account details in the "Create GL Account with Starting Balance" form
4. Select an account type
5. Choose a parent account from the dropdown (filtered by the selected account type)
6. Complete the remaining fields and submit the form

## Technical Notes

- Parent accounts are filtered by account type to maintain accounting integrity
- The parent selection is cleared when changing account types
- The API properly handles both the creation of top-level accounts (null parent_id) and child accounts
- Type checking ensures proper data handling throughout the process
