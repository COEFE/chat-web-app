/**
 * Credit Card Agent Enhancement Application Script
 * 
 * This script applies AI-powered enhancements to the Credit Card Agent
 * to handle direct transaction recording with Claude 3.5 instead of regex patterns
 */

import { applyCreditCardAgentEnhancements } from './creditCardAgentEnhanced';

// Import the existing credit card agent
// Note: This will need to be adjusted based on how the agent is exported
let CreditCardAgent: any;

try {
  // Dynamic import to avoid circular dependencies
  const creditCardModule = require('./creditCardAgent');
  CreditCardAgent = creditCardModule.CreditCardAgent || creditCardModule.default;
} catch (error) {
  console.error('Error importing CreditCardAgent:', error);
}

/**
 * Apply enhancements to the Credit Card Agent
 * This function should be called during agent initialization
 */
export function enhanceCreditCardAgent() {
  if (!CreditCardAgent) {
    console.error('[CreditCardEnhancement] CreditCardAgent not found, cannot apply enhancements');
    return false;
  }

  try {
    // Apply the enhancements to the prototype or instance
    if (CreditCardAgent.prototype) {
      // If it's a class, enhance the prototype
      const originalProcessRequest = CreditCardAgent.prototype.processRequest;
      const originalCanHandle = CreditCardAgent.prototype.canHandle;
      
      // Import the enhanced methods
      const { enhancedProcessRequest, enhancedCanHandle } = require('./creditCardAgentEnhanced');
      
      // Replace the methods
      CreditCardAgent.prototype.processRequest = enhancedProcessRequest;
      CreditCardAgent.prototype.canHandle = enhancedCanHandle;
      
      console.log('[CreditCardEnhancement] Successfully applied AI-powered enhancements to CreditCardAgent');
      return true;
    } else {
      console.error('[CreditCardEnhancement] CreditCardAgent is not a class, cannot enhance prototype');
      return false;
    }
  } catch (error) {
    console.error('[CreditCardEnhancement] Error applying enhancements:', error);
    return false;
  }
}

/**
 * Manual enhancement for specific agent instances
 */
export function enhanceCreditCardAgentInstance(agentInstance: any) {
  try {
    applyCreditCardAgentEnhancements(agentInstance);
    return true;
  } catch (error) {
    console.error('[CreditCardEnhancement] Error enhancing agent instance:', error);
    return false;
  }
}

// Auto-apply enhancements when this module is imported
if (typeof window === 'undefined') {
  // Only run on server-side
  enhanceCreditCardAgent();
}
