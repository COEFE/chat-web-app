import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { 
  getVendors, 
  getVendor, 
  createVendor, 
  Vendor
} from '@/lib/accounting/vendorQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

// GET /api/vendors - fetch vendors with optional filtering
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || undefined;
    const includeDeletedParam = url.searchParams.get('includeDeleted');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    // Handle specific vendor request
    const vendorId = url.searchParams.get('id');
    if (vendorId) {
      const vendor = await getVendor(parseInt(vendorId, 10), userId);
      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }
      return NextResponse.json(vendor);
    }
    
    // Handle includeDeleted parameter
    const includeDeleted = includeDeletedParam === 'true';
    
    // Get vendors with pagination and filters
    const { vendors, total } = await getVendors(
      page,
      limit,
      search,
      includeDeleted,
      userId // Pass user_id for proper data isolation
    );
    
    return NextResponse.json({
      vendors,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('[vendors] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch vendors' },
      { status: 500 }
    );
  }
}

// POST /api/vendors - create a new vendor
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const body = await req.json();
    
    // Validate required fields
    if (!body.vendor || !body.vendor.name) {
      return NextResponse.json({ 
        error: 'Vendor name is required' 
      }, { status: 400 });
    }
    
    const vendorData: Vendor = {
      name: body.vendor.name,
      contact_person: body.vendor.contact_person,
      email: body.vendor.email,
      phone: body.vendor.phone,
      address: body.vendor.address,
      default_expense_account_id: body.vendor.default_expense_account_id
    };
    
    // Pass userId to ensure proper data isolation
    const newVendor = await createVendor(vendorData, userId);

    // Audit Log for Vendor Creation
    if (userId && newVendor && typeof newVendor.id !== 'undefined') {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'VENDOR_CREATED',
        entity_type: 'Vendor',
        entity_id: newVendor.id,
        changes_made: [
          { field: 'name', old_value: null, new_value: newVendor.name },
          { field: 'contact_person', old_value: null, new_value: newVendor.contact_person },
          { field: 'email', old_value: null, new_value: newVendor.email },
          { field: 'phone', old_value: null, new_value: newVendor.phone },
          { field: 'address', old_value: null, new_value: newVendor.address },
          { field: 'default_expense_account_id', old_value: null, new_value: newVendor.default_expense_account_id },
        ].filter(change => typeof change.new_value !== 'undefined' && change.new_value !== null), // Log defined and non-null new values
        status: 'SUCCESS',
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error("Audit Log Error (VENDOR_CREATED):", auditError);
      }
    }
    
    return NextResponse.json({
      success: true,
      vendor: newVendor
    }, { status: 201 });
  } catch (err: any) {
    console.error('[vendors] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create vendor' },
      { status: 500 }
    );
  }
}
