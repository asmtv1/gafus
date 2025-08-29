import { NextResponse } from 'next/server';
import { getPublicKeyAction } from '@shared/lib/actions/publicKey';

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
    console.error('Error getting public key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
