import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import fs from 'fs';
import path from 'path';

/**
 * API endpoint to save OpenAI API key to .env.local
 * 
 * POST /api/config/openai-key
 * Body: { key: "sk-..." }
 */
export async function POST(req: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse request body
    const body = await req.json();
    const { key } = body;
    
    if (!key || typeof key !== 'string' || !key.startsWith('sk-')) {
      return NextResponse.json({
        error: 'Invalid OpenAI API key format'
      }, { status: 400 });
    }
    
    // Get path to .env.local file
    const envPath = path.join(process.cwd(), '.env.local');
    
    let envContent = '';
    
    // Read existing env file if it exists
    try {
      envContent = fs.readFileSync(envPath, 'utf8');
    } catch (err) {
      // File doesn't exist, create new one
      envContent = '';
    }
    
    // Update or add OPENAI_API_KEY
    const lines = envContent.split('\n');
    const keyRegex = /^OPENAI_API_KEY=/;
    let found = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (keyRegex.test(lines[i])) {
        lines[i] = `OPENAI_API_KEY=${key}`;
        found = true;
        break;
      }
    }
    
    if (!found) {
      lines.push(`OPENAI_API_KEY=${key}`);
    }
    
    // Write back to file
    fs.writeFileSync(envPath, lines.join('\n'));
    
    // Restart may be needed for env vars to take effect
    // Note this to the client in the response
    
    return NextResponse.json({
      success: true,
      message: 'OpenAI API key saved successfully. A server restart may be required for changes to take effect.'
    });
  } catch (error: any) {
    console.error('[openai-key] Error:', error);
    
    return NextResponse.json({
      error: 'Failed to save OpenAI API key: ' + (error.message || 'Unknown error')
    }, { status: 500 });
  }
}
