import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getFirestore } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const idToken = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized: No token' }, { status: 401 });
    }

    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const db = getFirestore();
    // Fetch all documents for this user from users/{userId}/documents subcollection
    const snapshot = await db.collection('users').doc(userId).collection('documents').get();

    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      fileName: doc.get('fileName'),
      status: doc.get('status'),
    }));

    return NextResponse.json({ documents: docs }, { status: 200 });
  } catch (error) {
    console.error('[api/prepaid-list] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
