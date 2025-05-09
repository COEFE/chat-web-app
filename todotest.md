# Journal Functionality Test Cases

## I. Journal Creation & Basic State
- [ ] **Test Case 1.1: Create a new, unposted journal.**
  - **Action:** Call `POST /api/journals` with valid journal data.
  - **Expected:** HTTP 201, new journal ID, `is_posted = FALSE`, `is_deleted = FALSE`, lines correct, audit log for 'CREATE'.
  - **Hooks:** `beforePost`, `afterPost`.

## II. Journal Posting
- [ ] **Test Case 2.1: Post an existing, unposted journal.**
  - **Action:** Call `POST /api/journals/{id}/post` (using journal from 1.1).
  - **Expected:** HTTP 200, `is_posted = TRUE`, audit log for 'POST' with before/after state.
  - **Hooks:** `beforePost`, `afterPost`.
- [ ] **Test Case 2.2: Attempt to post an already posted journal.**
  - **Action:** Call `POST /api/journals/{id}/post` again (journal from 2.1).
  - **Expected:** HTTP 400, error "Journal is already posted."
  - **Hooks:** `beforePost` prevents.
- [ ] **Test Case 2.3: Attempt to post a non-existent journal.**
  - **Action:** Call `POST /api/journals/{invalid_id}/post`.
  - **Expected:** HTTP 404, error "Journal not found."
  - **Hooks:** `beforePost` or query handles.

## III. Journal Unposting
- [ ] **Test Case 3.1: Unpost an existing, posted journal.**
  - **Action:** Call `POST /api/journals/{id}/unpost` (journal from 2.1).
  - **Expected:** HTTP 200, `is_posted = FALSE`, audit log for 'UNPOST' with before/after state.
  - **Hooks:** `afterUnpost`.
- [ ] **Test Case 3.2: Attempt to unpost an already unposted journal.**
  - **Action:** Call `POST /api/journals/{id}/unpost` (journal from 3.1 or 1.1).
  - **Expected:** HTTP 400, error "Journal is not currently posted."
  - **Verification:** `unpostJournal` internal checks.
- [ ] **Test Case 3.3: Attempt to unpost a non-existent journal.**
  - **Action:** Call `POST /api/journals/{invalid_id}/unpost`.
  - **Expected:** HTTP 404/400, error "Journal not found."
  - **Verification:** `unpostJournal` internal checks.

## IV. Journal Update
- [ ] **Test Case 4.1: Update an unposted journal.**
  - **Action:** Create new journal, `PUT /api/journals/{id}` with valid updates.
  - **Expected:** HTTP 200, data updated, audit log for 'UPDATE' with before/after state.
  - **Hooks:** `beforeUpdate`, `afterUpdate`.
- [ ] **Test Case 4.2: Attempt to update a posted journal.**
  - **Action:** Post journal, `PUT /api/journals/{id}` with updates.
  - **Expected:** HTTP 400, error "Cannot update a posted journal."
  - **Hooks:** `beforeUpdate` prevents.
- [ ] **Test Case 4.3: Attempt to update a non-existent journal.**
  - **Action:** `PUT /api/journals/{invalid_id}`.
  - **Expected:** HTTP 404.
  - **Hooks:** `beforeUpdate` handles.
- [ ] **Test Case 4.4: Attempt to update a soft-deleted journal.**
  - **Action:** Soft delete journal, then `PUT /api/journals/{id}`.
  - **Expected:** HTTP 404 or specific error for deleted.
  - **Hooks:** `beforeUpdate` checks `is_deleted`.

## V. Journal Soft Delete
- [ ] **Test Case 5.1: Soft delete an unposted journal.**
  - **Action:** Create new journal, `DELETE /api/journals/{id}`.
  - **Expected:** HTTP 200/204, `is_deleted = TRUE`, `deleted_at` set, audit log for 'DELETE' with before state.
  - **Hooks:** `beforeDelete`, `afterDelete`.
- [ ] **Test Case 5.2: Attempt to soft delete a posted journal.**
  - **Action:** Post journal, `DELETE /api/journals/{id}`.
  - **Expected:** HTTP 400, error "Cannot delete a posted journal."
  - **Hooks:** `beforeDelete` prevents.
- [ ] **Test Case 5.3: Attempt to soft delete a non-existent journal.**
  - **Action:** `DELETE /api/journals/{invalid_id}`.
  - **Expected:** HTTP 404.
  - **Hooks:** `beforeDelete` handles.
- [ ] **Test Case 5.4: Attempt to soft delete an already soft-deleted journal.**
  - **Action:** Soft delete journal, then `DELETE /api/journals/{id}` again.
  - **Expected:** HTTP 404.
  - **Hooks:** `beforeDelete` handles.

## VI. Data Integrity & Access after Soft Delete
- [ ] **Test Case 6.1: Attempt to fetch a soft-deleted journal via GET /api/journals/{id}.**
  - **Action:** Soft delete journal, `GET /api/journals/{id}`.
  - **Expected:** HTTP 404.
- [ ] **Test Case 6.2: Ensure soft-deleted journals are excluded from list views (e.g., GET /api/journals).**
  - **Action:** Create journals, soft delete one, `GET /api/journals`.
  - **Expected:** Soft-deleted journal not in list.
- [ ] **Test Case 6.3 (Optional): Fetch a soft-deleted journal (if admin/specific endpoint exists).**
  - **Action:** `GET /api/journals/{id}?include_deleted=true` (or similar).
  - **Expected:** Journal data returned, `is_deleted = TRUE`.

## VII. Audit Log Verification (General)
- [ ] **Test Case 7.1: Verify audit log content.**
  - **Action:** Perform various operations (post, unpost, update, delete).
  - **Expected:** `journal_audit` has correct `journal_id`, `changed_by`, `action`, `before_state`, `after_state`, `changed_at` for each.
