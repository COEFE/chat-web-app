import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { 
  getVendor, 
  updateVendor, 
  deleteVendor
} from '@/lib/accounting/vendorQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

// GET /api/vendors/[id] - fetch a specific vendor
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid vendor ID' }, { status: 400 });
  }

  try {
    const vendor = await getVendor(id);
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    return NextResponse.json(vendor);
  } catch (err: any) {
    console.error(`[vendors/${id}] GET error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch vendor' },
      { status: 500 }
    );
  }
}

// PUT /api/vendors/[id] - update a specific vendor
export async function PUT(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid vendor ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    
    if (!body.vendor) {
      return NextResponse.json({ error: 'Vendor data is required' }, { status: 400 });
    }
    
    // Fetch existing vendor for audit logging comparison
    const existingVendor = await getVendor(id);
    if (!existingVendor) {
      return NextResponse.json({ error: 'Vendor not found for audit pre-check' }, { status: 404 });
    }

    const updatedVendor = await updateVendor(id, body.vendor);
    if (!updatedVendor) {
      return NextResponse.json({ error: 'Vendor not found or failed to update' }, { status: 404 });
    }

    // Audit Log for Vendor Update
    if (userId) {
      const changes: { field: string; old_value: any; new_value: any }[] = [];
      const fieldsToCompare: (keyof typeof existingVendor)[] = [
        'name', 'contact_person', 'email', 'phone', 'address', 'default_expense_account_id'
      ];

      for (const field of fieldsToCompare) {
        if (existingVendor[field] !== updatedVendor[field] && 
            (existingVendor[field] !== undefined || updatedVendor[field] !== undefined)) { // Log if value changed
          changes.push({
            field: String(field),
            old_value: existingVendor[field],
            new_value: updatedVendor[field],
          });
        }
      }

      if (changes.length > 0) {
        const auditEntry: AuditLogData = {
          timestamp: new Date().toISOString(),
          user_id: userId,
          action_type: 'VENDOR_UPDATED',
          entity_type: 'Vendor',
          entity_id: id,
          changes_made: changes,
          status: 'SUCCESS',
        };
        try {
          logAuditEvent(auditEntry);
        } catch (auditError) {
          console.error(`Audit Log Error (VENDOR_UPDATED, ID: ${id}):`, auditError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      vendor: updatedVendor
    });
  } catch (err: any) {
    console.error(`[vendors/${id}] PUT error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to update vendor' },
      { status: 500 }
    );
  }
}

// DELETE /api/vendors/[id] - soft delete a vendor
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid vendor ID' }, { status: 400 });
  }

  try {
    // Fetch vendor state before deletion for audit log context
    const vendorToDelete = await getVendor(id);
    if (!vendorToDelete) {
      return NextResponse.json({ error: 'Vendor not found for pre-delete check' }, { status: 404 });
    }

    const result = await deleteVendor(id);
    // deleteVendor in this setup likely returns a success/fail or throws an error.
    // We rely on it not throwing an error for success.
    // If result had more info (like rows affected), we could use it.
    // Assuming if deleteVendor doesn't throw, it's successful for the purpose of audit logging a successful attempt.

    // Audit Log for Vendor Deletion
    if (userId) {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'VENDOR_DELETED',
        entity_type: 'Vendor',
        entity_id: id,
        changes_made: [
          { field: 'is_deleted', old_value: vendorToDelete.is_deleted, new_value: true }
        ],
        status: 'SUCCESS',
        context: { vendor_name: vendorToDelete.name }, // Log original name for context
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error(`Audit Log Error (VENDOR_DELETED, ID: ${id}):`, auditError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (err: any) {
    console.error(`[vendors/${id}] DELETE error:`, err);
    
    // Special handling for deletion restrictions (e.g. vendor has associated bills)
    if (err.message && err.message.includes('Cannot delete vendor')) {
      return NextResponse.json(
        { error: err.message },
        { status: 409 } // Conflict status code
      );
    }
    
    return NextResponse.json(
      { error: err.message || 'Failed to delete vendor' },
      { status: 500 }
    );
  }
}
