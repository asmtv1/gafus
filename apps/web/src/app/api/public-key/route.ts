import { NextResponse } from 'next/server';
import { getPublicKeyAction } from '@shared/server-actions/push';
import { createWebLogger } from '@gafus/logger';

// Создаем логгер для web API
const logger = createWebLogger('web-api-public-key');

export async function GET() {
  try {
    const result = await getPublicKeyAction();
    
    if (!result.isDefined) {
      return NextResponse.json(
        { error: 'VAPID_PUBLIC_KEY not configured' },
        { status: 500 }
      );
    }
    
    if (!result.isValid) {
      return NextResponse.json(
        { error: 'VAPID_PUBLIC_KEY format invalid' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      publicKey: result.publicKey,
      success: true
    });
    
  } catch (error) {
    logger.error('Error getting public key', error as Error, {
      operation: 'get_public_key',
      endpoint: '/api/public-key'
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
