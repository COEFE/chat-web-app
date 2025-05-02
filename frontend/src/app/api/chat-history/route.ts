import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { firestore } from 'firebase-admin';
import { getAdminDb, initializeFirebaseAdmin } from '@/lib/firebaseAdminConfig';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

export async function GET(req: NextRequest) {
  console.log("--- /api/chat-history GET request received ---");

  let db: firestore.Firestore;
  let auth: admin.auth.Auth;

  try {
    db = getAdminDb(); // This should handle initialization
    auth = getAdminAuth(); // This should also handle initialization or use the existing one
  } catch (error) {
    console.error("Failed to get Firebase Admin instances:", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // 1. Authentication
  const authorizationHeader = req.headers.get("Authorization");
  let userId: string;
  try {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Unauthorized: Missing or invalid Authorization header" }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    userId = decodedToken.uid;
    console.log("User authenticated:", userId);
  } catch (error) { 
    console.error("Authentication error:", error);
    return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
  }

  // 2. Firestore Collection Group Query
  try {
    const messagesQuery = db.collectionGroup('messages')
      .where('userId', '==', userId) // Filter by the authenticated user
      .orderBy('createdAt', 'desc') // Order by most recent first
      .limit(200); // Limit results initially for performance

    const querySnapshot = await messagesQuery.get();

    if (querySnapshot.empty) {
      console.log('No chat history found for user:', userId);
      return NextResponse.json({ messages: [] }, { status: 200 });
    }

    const messages = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const createdAtTimestamp = data.createdAt as firestore.Timestamp;
      const chatId = doc.ref.parent.parent.id; // extract chat session ID
      return {
        id: doc.id,
        chatId,
        ...data,
        // Convert Timestamp to ISO string
        createdAt: createdAtTimestamp?.toDate().toISOString() || null,
      };
    });

    console.log(`Fetched ${messages.length} messages for user ${userId}`);
    return NextResponse.json({ messages }, { status: 200 });

  } catch (error) {
    console.error("Error fetching chat history:", error);
    return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
  }
}
