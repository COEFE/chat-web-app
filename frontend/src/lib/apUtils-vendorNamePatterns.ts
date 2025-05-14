  // Extract vendor name
  const namePatterns = [
    // Direct name specification
    /(?:vendor|supplier)\s+(?:name|called|named)\s*[:=]?\s*["']?([^"',.\d][^,."']*)["']?/i,
    /(?:name|call|called)\s+["']?([^"',.\d][^,."']*)["']?/i,
    
    // "for [name]" pattern
    /(?:vendor|supplier)\s+(?:account|record)?\s+for\s+["']?([^"',.\d][^,."']*)["']?/i,
    /for\s+["']?([^"',.\d][^,."']*)["']?/i,
    
    // "new [name] vendor" pattern - catches "new Apple vendor"
    /new\s+([^"',.\d][^,."'\s]*?)\s+(?:vendor|supplier)(?:\s|$)/i,
    
    // "want create a new [name] vendor" pattern
    /want\s+(?:to\s+)?create\s+(?:a\s+)?(?:new\s+)?([^"',.\d][^,."'\s]*?)\s+(?:vendor|supplier)(?:\s|$)/i,
    /i\s+want\s+(?:to\s+)?create\s+(?:a\s+)?(?:new\s+)?([^"',.\d][^,."'\s]*?)\s+(?:vendor|supplier)(?:\s|$)/i,
    
    // More general patterns as fallback
    /create\s+(?:a|an)\s+(?:new\s+)?(?:vendor|supplier)\s+([^"',.\d][^,."']*?)(?:\s|$)/i
  ];
