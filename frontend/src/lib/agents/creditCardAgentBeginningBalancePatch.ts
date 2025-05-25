/**
 * Patch for CreditCardAgent to add beginningBalanceIntegration property
 * This needs to be manually integrated into the main CreditCardAgent class
 */

// Add this property after line 103 (after private anthropic: Anthropic;)
// private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;

// Add this line in the constructor after line 111 (after the anthropic initialization)
// this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();

export const PATCH_INSTRUCTIONS = `
1. Add property declaration after line 103:
   private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;

2. Add initialization in constructor after line 111:
   this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();
`;
