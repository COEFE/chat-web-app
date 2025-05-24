# GL Agent Parent Account Integration Plan

## Current State

The GL agent currently doesn't understand or use parent account relationships when creating accounts. The `createGLAccount` function has been updated to support parent accounts, but the agent isn't passing this parameter.

## Required Changes

### 1. Update GL Agent Account Creation Logic

Two locations need modification:
- Regular account creation (~line 402)
- AI-assisted account creation (~line 2311)

Both need to pass the parent account ID parameter to `createGLAccount`.

### 2. Update Natural Language Understanding

The agent needs to extract parent account information from user queries:
- Update `extractGLAccountInfoFromQuery` to detect parent account references
- Update `extractGLAccountInfoWithAI` to include parent account details
- Add pattern matching for phrases like "child of", "under", "sub-account of"

### 3. Add Parent Account Lookup

Before creating an account, the agent needs to:
- Look up potential parent accounts by name or code
- Validate that the parent account exists
- Ensure parent and child are of the same account type

## Implementation Approach

### Phase 1: Minimal Changes for Basic Support

1. Add a `parentId` parameter to the agent's account creation calls (passing `null` by default)
2. Update the agent's response to acknowledge parent-child relationships

### Phase 2: Enhanced Natural Language Understanding

1. Update AI prompt templates to include parent account concepts
2. Enhance extraction functions to detect parent account references
3. Add parent account lookup capabilities

### Phase 3: Proactive Suggestions

1. When creating accounts, suggest appropriate parent accounts
2. Provide hierarchy information when discussing accounts

## Considerations

- **Backward Compatibility**: All changes must maintain compatibility with existing code
- **Error Handling**: Add robust error handling for parent account lookups
- **User Experience**: Ensure clear communication about parent-child relationships
- **Testing**: Thoroughly test with various query formats

## Recommendation

Start with Phase 1 to enable basic support for parent accounts in the agent, then implement Phases 2 and 3 as separate enhancements after testing.

This approach:
- Maintains existing functionality
- Adds new capabilities incrementally
- Follows the pattern of minimal, focused changes
- Ensures backward compatibility
