import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

// POST /api/journals/add-user-id-column - Add user_id column to journals table
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    console.log('[journals/add-user-id-column] Starting migration...');
    console.log(`[journals/add-user-id-column] Current user ID: ${userId}`);

    // Check if user_id column already exists
    const columnCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'journals' AND column_name = 'user_id'
      ) as exists;
    `;

    const hasUserIdColumn = columnCheck.rows[0].exists;
    console.log(`[journals/add-user-id-column] Column exists: ${hasUserIdColumn}`);

    if (!hasUserIdColumn) {
      // Add user_id column to journals table
      await sql`
        ALTER TABLE journals 
        ADD COLUMN user_id VARCHAR(128) NULL;
      `;
      console.log('[journals/add-user-id-column] Added user_id column');

      // Create index on user_id for better query performance
      await sql`
        CREATE INDEX idx_journals_user_id ON journals(user_id);
      `;
      console.log('[journals/add-user-id-column] Created index on user_id');
    }

    // Count journals with NULL user_id before update
    const beforeCount = await sql`
      SELECT COUNT(*) as count 
      FROM journals 
      WHERE user_id IS NULL AND is_deleted = FALSE;
    `;
    
    const nullCount = parseInt(beforeCount.rows[0].count);
    console.log(`[journals/add-user-id-column] Found ${nullCount} journals with NULL user_id`);

    // Update ALL existing journals to associate with the current user
    // Note: We're not filtering by is_deleted to ensure ALL records are updated
    const updateResult = await sql`
      UPDATE journals 
      SET user_id = ${userId}
      WHERE user_id IS NULL;
    `;
    
    console.log(`[journals/add-user-id-column] Updated ${updateResult.rowCount} journals with user_id = ${userId}`);

    // Check if NOT NULL constraint is already applied
    const nullableCheck = await sql`
      SELECT is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'journals' AND column_name = 'user_id';
    `;
    
    const isNullable = nullableCheck.rows[0].is_nullable === 'YES';
    console.log(`[journals/add-user-id-column] Column is nullable: ${isNullable}`);

    if (isNullable) {
      // Double-check that there are no NULL values left
      const nullCheckAfterUpdate = await sql`
        SELECT COUNT(*) as count 
        FROM journals 
        WHERE user_id IS NULL;
      `;
      
      const remainingNulls = parseInt(nullCheckAfterUpdate.rows[0].count);
      console.log(`[journals/add-user-id-column] Remaining NULL values after update: ${remainingNulls}`);
      
      if (remainingNulls > 0) {
        console.log('[journals/add-user-id-column] WARNING: Still have NULL values, attempting one more update');
        // Try one more time to update any remaining NULL values
        await sql`
          UPDATE journals 
          SET user_id = ${userId}
          WHERE user_id IS NULL;
        `;
      }
      
      // Final check before adding NOT NULL constraint
      const finalNullCheck = await sql`
        SELECT COUNT(*) as count 
        FROM journals 
        WHERE user_id IS NULL;
      `;
      
      const finalNulls = parseInt(finalNullCheck.rows[0].count);
      console.log(`[journals/add-user-id-column] Final NULL count: ${finalNulls}`);
      
      if (finalNulls === 0) {
        // Add NOT NULL constraint after updating existing data
        try {
          await sql`
            ALTER TABLE journals 
            ALTER COLUMN user_id SET NOT NULL;
          `;
          console.log('[journals/add-user-id-column] Added NOT NULL constraint to user_id');
        } catch (e) {
          console.error('[journals/add-user-id-column] Error adding NOT NULL constraint:', e);
          return NextResponse.json({ 
            success: true, 
            message: 'Updated journals with your user ID, but could not add NOT NULL constraint. Some journals may still have NULL user_id values.',
            warning: 'Could not add NOT NULL constraint',
            error: e instanceof Error ? e.message : 'Unknown error adding constraint'
          });
        }
      } else {
        console.log('[journals/add-user-id-column] WARNING: Still have NULL values, skipping NOT NULL constraint');
        return NextResponse.json({ 
          success: true, 
          message: 'Updated journals with your user ID, but some journals still have NULL user_id values.',
          warning: 'Could not add NOT NULL constraint due to remaining NULL values'
        });
      }
    }

    // Count total journals and journals for current user after update
    const totalCount = await sql`SELECT COUNT(*) as count FROM journals WHERE is_deleted = FALSE;`;
    const userCount = await sql`SELECT COUNT(*) as count FROM journals WHERE user_id = ${userId} AND is_deleted = FALSE;`;
    
    console.log(`[journals/add-user-id-column] Total journals: ${totalCount.rows[0].count}, User journals: ${userCount.rows[0].count}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully updated journals with your user ID', 
      stats: {
        totalJournals: parseInt(totalCount.rows[0].count),
        userJournals: parseInt(userCount.rows[0].count),
        updatedJournals: updateResult.rowCount
      }
    });
  } catch (err: any) {
    console.error('[journals/add-user-id-column] Error:', err);
    return NextResponse.json({ 
      error: err?.message || 'Unknown error',
      stack: err?.stack
    }, { status: 500 });
  }
}
