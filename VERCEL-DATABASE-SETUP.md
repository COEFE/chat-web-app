# 🗄️ Vercel Database Environment Variables Setup

## 📋 **Database Variables to Add**

Based on your production Neon database, add these **exact** environment variables to Vercel:

### **Required Database Variables:**

```bash
# Primary Database URL (Neon Production)
DATABASE_URL=postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require

# Postgres URL (Same as DATABASE_URL for compatibility)
POSTGRES_URL=postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require
```

## 🎯 **How to Add in Vercel Dashboard:**

### **Step 1: Add DATABASE_URL**
1. Click **"Add New"** button
2. **Name:** `DATABASE_URL`
3. **Value:** `postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require`
4. **Environment:** Check ✅ **Production**
5. Click **"Save"**

### **Step 2: Add POSTGRES_URL**
1. Click **"Add New"** button
2. **Name:** `POSTGRES_URL`
3. **Value:** `postgresql://neondb_owner:npg_MfFXnO1I7uiJ@ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech/neondb?sslmode=require`
4. **Environment:** Check ✅ **Production**
5. Click **"Save"**

## 🔍 **What This Database Contains:**

Your production database is **already set up** with:

### **✅ 7 MVP Tables Ready:**
1. **accounts** - Chart of accounts (14 basic accounts)
2. **vendors** - Vendor management
3. **bills** - Expense tracking
4. **bill_lines** - Line item details
5. **receipt_embeddings** - AI receipt processing
6. **journals** - Transaction recording
7. **journal_lines** - Double-entry bookkeeping

### **✅ Chart of Accounts (14 accounts):**
- **Assets:** Cash, Checking Account
- **Liabilities:** Accounts Payable
- **Expenses:** Office Supplies, Meals & Entertainment, Service Fees, Credit Card Processing Fees, Professional Services, Travel, Utilities, Rent, Insurance, Bank Charges, Miscellaneous

### **✅ AI Features Ready:**
- Vector extension enabled for receipt embeddings
- GAAP-compliant expense classification
- Multi-tenant with user_id separation

## 🚨 **Important Notes:**

### **Security:**
- This connection string includes the password
- It's safe to use in Vercel environment variables
- Never commit this to your Git repository

### **Connection Details:**
- **Database:** `neondb`
- **User:** `neondb_owner`
- **Host:** `ep-still-meadow-a87znttq-pooler.eastus2.azure.neon.tech`
- **SSL:** Required (included in connection string)

### **Why Two Variables:**
- `DATABASE_URL` - Primary connection used by most parts of the app
- `POSTGRES_URL` - Compatibility for some libraries that expect this name

## ✅ **Verification:**

After adding these variables, your Vercel environment should show:
- ✅ `DATABASE_URL` - Production environment
- ✅ `POSTGRES_URL` - Production environment

## 🎯 **Next Steps:**

1. **Add these 2 database variables** to Vercel
2. **Add Firebase variables** (from the service account JSON you downloaded)
3. **Add AI API keys** (your existing Anthropic/OpenAI keys)
4. **Deploy and test!**

Your database is **production-ready** with all ExpenseAI MVP features! 🚀
