'use client';

import { useFeatureFlags } from '@/lib/featureFlags';

export default function FeatureFlagDebug() {
  const features = useFeatureFlags();
  
  // Only show in development or when explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SHOW_DEBUG) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-sm z-50">
      <h3 className="font-bold mb-2">Feature Flags Debug</h3>
      <div className="space-y-1">
        <div>Environment: {process.env.NODE_ENV}</div>
        <div>Product Tier: {process.env.NEXT_PUBLIC_PRODUCT_TIER || 'undefined'}</div>
        <div className="mt-2 font-semibold">Features:</div>
        {Object.entries(features).map(([key, value]) => (
          <div key={key} className={value ? 'text-green-400' : 'text-red-400'}>
            {key}: {value ? '✅' : '❌'}
          </div>
        ))}
      </div>
    </div>
  );
}
