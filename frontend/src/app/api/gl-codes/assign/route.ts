import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/authenticateRequest";
import { findRelevantGLCodes } from "@/lib/glUtils";
import { sql } from '@vercel/postgres';

/**
 * Extract meaningful category words from vendor names and descriptions
 * This helps match vendors to appropriate GL codes
 */
function extractCategoryWords(text: string): string[] {
  // Common business categories and their related terms
  const categoryMap: Record<string, string[]> = {
    'office': ['office', 'supply', 'supplies', 'paper', 'stationery'],
    'software': ['software', 'license', 'subscription', 'digital', 'app', 'application'],
    'insurance': ['insurance', 'coverage', 'policy', 'premium', 'liability'],
    'rent': ['rent', 'lease', 'property', 'space', 'facility', 'facilities'],
    'utilities': ['utility', 'utilities', 'electric', 'water', 'gas', 'power'],
    'telecom': ['phone', 'mobile', 'cell', 'telecommunication', 'internet', 'broadband', 'wifi'],
    'marketing': ['marketing', 'advertising', 'promotion', 'campaign', 'media', 'ad', 'ads'],
    'travel': ['travel', 'airfare', 'hotel', 'lodging', 'transportation', 'flight'],
    'training': ['training', 'education', 'course', 'seminar', 'workshop', 'certification'],
    'legal': ['legal', 'attorney', 'lawyer', 'law', 'counsel', 'compliance'],
    'accounting': ['accounting', 'bookkeeping', 'tax', 'audit', 'financial'],
    'maintenance': ['maintenance', 'repair', 'service', 'cleaning', 'janitorial'],
    'hosting': ['hosting', 'server', 'cloud', 'storage', 'domain', 'web'],
    'membership': ['membership', 'dues', 'association', 'subscription', 'professional'],
    'consulting': ['consulting', 'consultant', 'advisor', 'professional', 'service'],
    'equipment': ['equipment', 'hardware', 'device', 'machine', 'technology']
  };
  
  // Normalize the input text
  const normalizedText = text.toLowerCase();
  
  // Find matching categories
  const matchedCategories: Set<string> = new Set();
  
  // First check for category names directly in the text
  Object.keys(categoryMap).forEach(category => {
    if (normalizedText.includes(category)) {
      matchedCategories.add(category);
    }
  });
  
  // Then check for related terms
  Object.entries(categoryMap).forEach(([category, terms]) => {
    for (const term of terms) {
      if (normalizedText.includes(term)) {
        matchedCategories.add(category);
        matchedCategories.add(term);
        break;
      }
    }
  });
  
  // Add any words that might be GL code related
  const words = normalizedText.split(/\s+/);
  const relevantWords = words.filter(word => 
    word.length > 3 && 
    !word.match(/^\d+$/) && // Skip pure numbers
    !['inc', 'llc', 'ltd', 'co', 'corp', 'the', 'and', 'for'].includes(word)
  );
  
  // Combine all matched categories and relevant words
  return [...matchedCategories, ...relevantWords];
}

export async function POST(req: NextRequest) {
  // 1) authenticate
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // 2) read the user's query from the body
    const { query, limit = 1 } = await req.json();
    
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    console.log(`[api/gl-codes/assign] Looking up GL code for: "${query}"`);

    // For prepaid expense workflow, we need a more direct approach
    // First try to extract category words from the vendor name
    const categoryWords = extractCategoryWords(query);
    console.log(`[api/gl-codes/assign] Extracted category keywords: ${categoryWords.join(', ')}`);

    // Try direct text search first (bypassing the mightBeAboutGLCodes check)
    let codes = [];
    
    try {
      // Build a search query using the category words
      const searchTerms = categoryWords.join(' | ');
      
      if (searchTerms) {
        console.log(`[api/gl-codes/assign] Searching with terms: ${searchTerms}`);
        const { rows } = await sql`
          SELECT id, gl_code, description, content,
                 ts_rank(to_tsvector('english', content), to_tsquery('english', ${searchTerms})) AS rank
          FROM gl_embeddings
          WHERE to_tsvector('english', content) @@ to_tsquery('english', ${searchTerms})
          ORDER BY rank DESC
          LIMIT ${limit}
        `;
        
        codes = rows;
        console.log(`[api/gl-codes/assign] Found ${codes.length} GL codes by direct search`);
      }
    } catch (err) {
      console.error('[api/gl-codes/assign] Error in direct search:', err);
    }
    
    // If direct search failed, fall back to the regular semantic search
    if (codes.length === 0) {
      console.log('[api/gl-codes/assign] Falling back to standard semantic search');
      codes = await findRelevantGLCodes(query, limit);
      console.log(`[api/gl-codes/assign] Found ${codes.length} relevant GL codes from fallback`);
    }

    // 4) return it
    return NextResponse.json({ codes }, { status: 200 });
  } catch (err) {
    console.error("[api/gl-codes/assign] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
