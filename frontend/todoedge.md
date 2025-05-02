# Prepaid Workflow Edge Cases

- **File-type & size validation**: Reject non-spreadsheet files and cap upload size to prevent abuse.
- **Storage vs Firestore atomicity**: Use transactions or compensating cleanup to avoid orphaned files/docs on partial failure.
- **Status lifecycle**: Define `processing` → `completed`/`failed` states and update the Firestore doc accordingly.
- **Security of public URLs**: Replace `makePublic()` with signed URLs or ACLs for private data.
- **Missing detail endpoint**: Provide `/api/prepaid/:id` to fetch analysis results, errors, and metadata.
- **CSV/Excel parsing failures**: Surface header detection or parse errors back to the user with clear messages.
- **Duplicate uploads**: Deduplicate on file checksum or name+user to prevent multiple docs for the same file.
- **Concurrency & retry**: Add idempotency keys or disable the upload button to avoid race conditions or double-processing.
- **Prepaid-schedule edge cases**: Handle month lengths (28–31 days), leap years, and time-zone effects when generating schedules.
- **Error reporting & cleanup**: On analysis crash, set `status = 'failed'`, store `errorMessage`, and offer a retry endpoint.
