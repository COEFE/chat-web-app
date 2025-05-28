import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function GET(request: NextRequest) {
  try {
    // Authenticate the request
    const authResult = await authenticateRequest(request);
    if (authResult.error) {
      return authResult.error;
    }
    const userId = authResult.userId;

    // Query to get receipts with associated bill and attachment information
    const query = `
      SELECT 
        re.id,
        re.vendor_name,
        re.receipt_date,
        re.total_amount,
        re.processed_status,
        re.created_at,
        re.line_items,
        re.receipt_image_url,
        re.last_four_digits as card_last_4,
        re.receipt_content,
        b.id as bill_id,
        b.description as bill_description,
        b.status as bill_status,
        ba.file_url as attachment_url,
        ba.file_name as attachment_name,
        ba.uploaded_at as attachment_uploaded_at,
        -- Aggregate bill line items
        COALESCE(
          json_agg(
            CASE 
              WHEN bl.id IS NOT NULL THEN
                json_build_object(
                  'id', bl.id,
                  'description', COALESCE(bl.description, ''),
                  'quantity', COALESCE(bl.quantity, 1),
                  'unit_price', COALESCE(bl.unit_price, 0),
                  'amount', COALESCE(bl.line_total, 0),
                  'category', COALESCE(bl.category, ''),
                  'is_tax', COALESCE(LOWER(bl.description) LIKE '%tax%' OR LOWER(bl.category) LIKE '%tax%', false),
                  'is_tip', COALESCE(LOWER(bl.description) LIKE '%tip%' OR LOWER(bl.description) LIKE '%gratuity%', false)
                )
              ELSE NULL
            END
          ) FILTER (WHERE bl.id IS NOT NULL),
          '[]'::json
        ) as bill_line_items
      FROM receipt_embeddings re
      LEFT JOIN bills b ON (
        b.vendor_id IN (
          SELECT v.id 
          FROM vendors v 
          WHERE LOWER(v.name) = LOWER(re.vendor_name)
        )
        AND b.bill_date = re.receipt_date
        AND ABS(b.total_amount - re.total_amount) < 0.01
        AND b.user_id = re.user_id
      )
      LEFT JOIN bill_attachments ba ON ba.bill_id = b.id
      LEFT JOIN bill_lines bl ON bl.bill_id = b.id
      WHERE re.user_id = $1
      GROUP BY re.id, re.vendor_name, re.receipt_date, re.total_amount, re.processed_status, 
               re.created_at, re.line_items, re.receipt_image_url, re.last_four_digits, re.receipt_content, b.id, b.description, 
               b.status, ba.file_url, ba.file_name, ba.uploaded_at
      ORDER BY re.created_at DESC, re.receipt_date DESC
    `;

    const result = await sql.query(query, [userId]);

    // Group results by receipt ID to handle multiple attachments per bill
    const receiptsMap = new Map();
    
    result.rows.forEach(row => {
      const receiptId = row.id;
      
      if (!receiptsMap.has(receiptId)) {
        receiptsMap.set(receiptId, {
          id: row.id,
          vendor_name: row.vendor_name,
          receipt_date: row.receipt_date,
          total_amount: row.total_amount,
          processed_status: row.processed_status,
          created_at: row.created_at,
          line_items: row.line_items || [],
          receipt_image_url: row.receipt_image_url,
          card_last_4: row.card_last_4,
          receipt_content: row.receipt_content,
          bill_id: row.bill_id,
          bill_description: row.bill_description,
          bill_status: row.bill_status,
          attachment_url: row.attachment_url,
          attachment_name: row.attachment_name,
          attachment_uploaded_at: row.attachment_uploaded_at,
          bill_line_items: row.bill_line_items,
        });
      } else {
        // If we already have this receipt but found another attachment, keep the first one
        // (or implement logic to prefer certain attachment types)
        const existing = receiptsMap.get(receiptId);
        if (!existing.attachment_url && row.attachment_url) {
          existing.attachment_url = row.attachment_url;
          existing.attachment_name = row.attachment_name;
          existing.attachment_uploaded_at = row.attachment_uploaded_at;
        }
      }
    });

    // Parse tax, tip, and subtotal information from bill_line_items
    const receipts = Array.from(receiptsMap.values()).map(receipt => {
      let sales_tax = 0;
      let tip = 0;
      let subtotal = 0;

      // Extract tax, tip, and subtotal from bill_line_items
      if (receipt.bill_line_items && Array.isArray(receipt.bill_line_items)) {
        receipt.bill_line_items.forEach((item: any) => {
          if (item.is_tax) {
            sales_tax += Number(item.amount || 0);
          } else if (item.is_tip) {
            tip += Number(item.amount || 0);
          } else {
            // Regular line items contribute to subtotal
            subtotal += Number(item.amount || 0);
          }
        });
      }

      // Fallback: if no bill line items, use the original receipt line_items for subtotal
      if (subtotal === 0 && receipt.line_items && Array.isArray(receipt.line_items)) {
        subtotal = receipt.line_items.reduce((sum: number, item: any) => 
          sum + Number(item.amount || item.total || (item.quantity || 1) * (item.unit_price || item.price || 0)), 0
        );
      }

      return {
        ...receipt,
        sales_tax: sales_tax > 0 ? sales_tax : null,
        tip: tip > 0 ? tip : null,
        subtotal: subtotal > 0 ? subtotal : null
      };
    });

    // Calculate summary statistics
    const totalReceipts = receipts.length;
    const totalAmount = receipts.reduce((sum: number, receipt: any) => sum + Number(receipt.total_amount), 0);
    const statusCounts = receipts.reduce((counts: Record<string, number>, receipt: any) => {
      counts[receipt.processed_status] = (counts[receipt.processed_status] || 0) + 1;
      return counts;
    }, {});

    return NextResponse.json({
      success: true,
      receipts,
      summary: {
        totalReceipts,
        totalAmount,
        statusCounts,
        completedReceipts: statusCounts.completed || 0,
        pendingReceipts: statusCounts.pending || 0,
        processingReceipts: statusCounts.processing || 0,
        failedReceipts: statusCounts.failed || 0,
      }
    });

  } catch (error) {
    console.error('Error fetching receipts:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch receipts',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

// Optional: Add POST method for creating new receipt entries
export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const authResult = await authenticateRequest(request);
    if (authResult.error) {
      return authResult.error;
    }
    const userId = authResult.userId;

    const body = await request.json();
    const { action } = body;

    if (action === 'refresh') {
      // Trigger a refresh of receipt processing status
      // This could be used to re-check processing status of pending receipts
      return NextResponse.json({ success: true, message: 'Refresh triggered' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in receipts POST:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}
