import { NextResponse } from 'next/server';
import { getFeatureFlags } from '@/lib/featureFlags';

export async function GET() {
  try {
    const features = getFeatureFlags();
    
    return NextResponse.json({
      environment: process.env.NODE_ENV,
      productTier: process.env.NEXT_PUBLIC_PRODUCT_TIER || 'undefined',
      features,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get feature flags' },
      { status: 500 }
    );
  }
}
