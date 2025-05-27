# 🔧 Vercel Environment Variables - ExpenseAI Production

## 📋 **Copy-Paste Ready for Vercel**

### **🔥 Firebase Client Configuration (Ready)**
```bash
NEXT_PUBLIC_FIREBASE_PROJECT_ID=expense-ai-production
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAXraFhGCScl5Lx9TJ79a4UmZdt4cPaB-U
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=expense-ai-production.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=expense-ai-production.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=336862392000
NEXT_PUBLIC_FIREBASE_APP_ID=1:336862392000:web:48b0affcd88b8dc8d78725
```

### **🔑 Firebase Admin (From Service Account JSON)**
```bash
FIREBASE_ADMIN_PROJECT_ID=expense-ai-production
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@expense-ai-production.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[PASTE_YOUR_PRIVATE_KEY_HERE]\n-----END PRIVATE KEY-----"
```

### **🗄️ Database Configuration (Ready)**
```bash
DATABASE_URL=postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require
```

### **🤖 AI Services (Your Existing Keys)**
```bash
ANTHROPIC_API_KEY=sk-ant-...YOUR-EXISTING-KEY...
OPENAI_API_KEY=sk-proj-...YOUR-EXISTING-KEY...
```

### **⚙️ Product Configuration**
```bash
NEXT_PUBLIC_PRODUCT_TIER=mvp
NEXT_PUBLIC_APP_NAME=ExpenseAI
NODE_ENV=production
```

---

## 🎯 **How to Add to Vercel:**

### **Method 1: Vercel Dashboard**
1. Go to your Vercel project settings
2. Click **"Environment Variables"**
3. Add each variable one by one:
   - **Name:** `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - **Value:** `expense-ai-production`
   - **Environment:** Production ✅

### **Method 2: Vercel CLI**
```bash
# Install Vercel CLI if needed
npm i -g vercel

# Set environment variables
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
# Enter: expense-ai-production

vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
# Enter: AIzaSyAXraFhGCScl5Lx9TJ79a4UmZdt4cPaB-U

# ... repeat for all variables
```

---

## ⚠️ **Important Notes:**

### **Firebase Private Key:**
- **Include the quotes** around the private key value
- **Keep the \n characters** - they're important for formatting
- **Example format:**
  ```
  "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----"
  ```

### **Environment Scope:**
- Set all variables for **Production** environment
- You can also set for **Preview** if you want staging testing

### **Security:**
- Never commit the service account JSON file to Git
- Use environment variables only
- Keep your API keys secure

---

## 🚀 **Ready to Deploy!**

Once all environment variables are set in Vercel:
1. **Redeploy** your project (or it will auto-deploy)
2. **Test authentication** - sign up/login
3. **Test receipt upload** - AI processing
4. **Verify database** - check Neon dashboard

**Your ExpenseAI MVP will be live!** 🎉
