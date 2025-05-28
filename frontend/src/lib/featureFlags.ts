// Feature flags for gradual product rollout
export interface FeatureFlags {
  // MVP Features (Phase 1)
  expenseTracking: boolean;
  receiptScanning: boolean;
  basicReporting: boolean;
  aiAssistant: boolean;
  
  // Advanced Features (Future Phases)
  invoicing: boolean;
  payroll: boolean;
  fullAccounting: boolean;
  multiEntity: boolean;
  integrations: boolean;
  
  // UI Features
  advancedNavigation: boolean;
  accounting: boolean;
  dashboard: boolean;
}

export const getFeatureFlags = (): FeatureFlags => {
  const environment = process.env.NODE_ENV;
  const productTier = process.env.NEXT_PUBLIC_PRODUCT_TIER || 'mvp';
  
  console.log('Feature Flags Debug:', { environment, productTier });
  
  // MVP configuration for consumer release (PRODUCTION DEFAULT)
  if (productTier === 'mvp' || (environment === 'production' && productTier !== 'enterprise')) {
    return {
      // Enabled for MVP
      expenseTracking: true,
      receiptScanning: true,
      basicReporting: true,
      aiAssistant: true,
      
      // Disabled for MVP
      invoicing: false,
      payroll: false,
      fullAccounting: false,
      multiEntity: false,
      integrations: false,
      
      // UI Features for MVP
      advancedNavigation: false,
      accounting: false,
      dashboard: true, // Simple dashboard only
    };
  }
  
  // Full feature set for development or explicit enterprise tier
  if (environment === 'development' || productTier === 'enterprise') {
    return {
      expenseTracking: true,
      receiptScanning: true,
      basicReporting: true,
      aiAssistant: true,
      invoicing: true,
      payroll: true,
      fullAccounting: true,
      multiEntity: true,
      integrations: true,
      advancedNavigation: true,
      accounting: true,
      dashboard: true,
    };
  }
  
  // Fallback to MVP (should never reach here with new logic)
  return {
    expenseTracking: true,
    receiptScanning: true,
    basicReporting: true,
    aiAssistant: true,
    invoicing: false,
    payroll: false,
    fullAccounting: false,
    multiEntity: false,
    integrations: false,
    advancedNavigation: false,
    accounting: false,
    dashboard: true,
  };
};

export const useFeatureFlags = () => {
  return getFeatureFlags();
};

// Helper function to check if feature is enabled
export const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
  const flags = getFeatureFlags();
  return flags[feature];
};
