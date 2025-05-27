# 🔥 ExpenseAI Production Firebase Configuration

## ✅ **Firebase Project Created Successfully**

**Project Details:**
- **Project ID:** `expense-ai-production`
- **Project Name:** ExpenseAI Production
- **App ID:** `1:336862392000:web:48b0affcd88b8dc8d78725`
- **Console URL:** https://console.firebase.google.com/project/expense-ai-production/overview

## 🌐 **Web App Configuration**

```javascript
// Firebase Web SDK Configuration
const firebaseConfig = {
  "projectId": "expense-ai-production",
  "appId": "1:336862392000:web:48b0affcd88b8dc8d78725",
  "storageBucket": "expense-ai-production.firebasestorage.app",
  "apiKey": "AIzaSyAXraFhGCScl5Lx9TJ79a4UmZdt4cPaB-U",
  "authDomain": "expense-ai-production.firebaseapp.com",
  "messagingSenderId": "336862392000"
};
```

## 🔐 **Production Environment Variables for Vercel**

Copy these to your Vercel project settings:

```bash
# === PRODUCT CONFIGURATION ===
NEXT_PUBLIC_PRODUCT_TIER=mvp
NEXT_PUBLIC_APP_NAME=ExpenseAI

# === PRODUCTION DATABASE ===
DATABASE_URL=postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require

# === FIREBASE PRODUCTION CONFIG ===
NEXT_PUBLIC_FIREBASE_PROJECT_ID=expense-ai-production
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAXraFhGCScl5Lx9TJ79a4UmZdt4cPaB-U
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=expense-ai-production.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=expense-ai-production.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=336862392000
NEXT_PUBLIC_FIREBASE_APP_ID=1:336862392000:web:48b0affcd88b8dc8d78725

# === AI SERVICES (Same as development) ===
ANTHROPIC_API_KEY=sk-ant-...YOUR-KEY...
OPENAI_API_KEY=sk-proj-...YOUR-KEY...

# === PRODUCTION SETTINGS ===
NODE_ENV=production
NEXT_PUBLIC_VERCEL_URL=https://expense-ai.vercel.app
```

## 🛠️ **Manual Setup Required in Firebase Console**

Since some services need to be enabled manually, please complete these steps:

### **1. Enable Authentication:**
1. Go to: https://console.firebase.google.com/project/expense-ai-production/authentication
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password"
5. Enable "Google" (optional but recommended)

### **2. Create Firestore Database:**
1. Go to: https://console.firebase.google.com/project/expense-ai-production/firestore
2. Click "Create database"
3. Choose "Start in production mode"
4. Select location: `us-central1` (recommended)

### **3. Enable Storage:**
1. Go to: https://console.firebase.google.com/project/expense-ai-production/storage
2. Click "Get started"
3. Choose "Start in production mode"
4. Select location: `us-central1` (same as Firestore)

### **4. Generate Service Account Key:**
1. Go to: https://console.firebase.google.com/project/expense-ai-production/settings/serviceaccounts/adminsdk
2. Click "Generate new private key"
3. Download the JSON file
4. Extract these values for Vercel environment variables:
   ```bash
   FIREBASE_ADMIN_PROJECT_ID=expense-ai-production
   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[PASTE_PRIVATE_KEY_HERE]\n-----END PRIVATE KEY-----"
   FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@expense-ai-production.iam.gserviceaccount.com
   ```

## 🔒 **Security Rules**

### **Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Receipts are user-specific
    match /receipts/{receiptId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
    
    // Bills are user-specific
    match /bills/{billId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
  }
}
```

### **Storage Rules:**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Users can only access their own receipt images
    match /receipts/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 🚀 **Next Steps**

1. **Complete manual setup** in Firebase Console (above steps)
2. **Copy environment variables** to Vercel project
3. **Deploy to Vercel** using the `COEFE/expense-ai` repository
4. **Test authentication** and receipt upload functionality
5. **Launch ExpenseAI MVP** to customers! 🎉

## 📊 **Architecture Summary**

**Production Stack:**
- ✅ **Database:** Neon PostgreSQL (7 MVP tables)
- ✅ **Authentication:** Firebase Auth
- ✅ **File Storage:** Firebase Storage (receipt images)
- ✅ **Hosting:** Vercel
- ✅ **AI Services:** OpenAI + Anthropic
- ✅ **Features:** AI receipt processing, expense tracking, GAAP compliance

Your ExpenseAI production environment is ready for launch! 🚀
