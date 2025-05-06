import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { getApiKeyStatus } from '@/lib/ai/embeddings';
import fs from 'fs';
import path from 'path';

/**
 * API endpoint to check the status of OpenAI API key configuration
 * 
 * GET /api/config/openai-status
 */
export async function GET(req: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get current API key status
    const status = getApiKeyStatus();
    
    // Check if .env.local file exists
    const envPath = path.join(process.cwd(), '.env.local');
    let fileExists = false;
    let hasKeyInFile = false;
    
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      fileExists = true;
      hasKeyInFile = envContent.includes('OPENAI_API_KEY=');
    } catch (err) {
      // File doesn't exist
    }
    
    // Get the environment variable directly
    const apiKey = process.env.OPENAI_API_KEY;
    
    return NextResponse.json({
      apiKeyStatus: status,
      envFileExists: fileExists,
      hasKeyInEnvFile: hasKeyInFile,
      hasKeyInEnv: !!apiKey,
      keyLength: apiKey ? apiKey.length : 0,
      keyPrefix: apiKey ? apiKey.substring(0, 3) : '',
      message: getStatusMessage(status, fileExists, hasKeyInFile, !!apiKey)
    });
  } catch (error: any) {
    console.error('[openai-status] Error:', error);
    
    return NextResponse.json({
      error: 'Failed to check OpenAI API key status: ' + (error.message || 'Unknown error')
    }, { status: 500 });
  }
}

/**
 * Generate a friendly status message based on the configuration
 */
function getStatusMessage(
  status: string, 
  fileExists: boolean, 
  hasKeyInFile: boolean, 
  hasKeyInEnv: boolean
): string {
  if (status === 'configured') {
    return 'OpenAI API key is properly configured and ready to use.';
  }
  
  if (status === 'error') {
    return 'There was an error initializing the OpenAI client. Check the logs for more details.';
  }
  
  if (!fileExists) {
    return 'No .env.local file found. Create one with your OpenAI API key to enable AI features.';
  }
  
  if (!hasKeyInFile) {
    return '.env.local exists but does not contain an OPENAI_API_KEY entry.';
  }
  
  if (!hasKeyInEnv) {
    return 'OPENAI_API_KEY is in .env.local but not loaded into environment. Server restart may be needed.';
  }
  
  return 'OpenAI API key status is unknown.';
}
