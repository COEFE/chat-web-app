# Production Environment Setup for ExpenseAI MVP

## 🎯 Strategy: Hybrid Approach
- **Shared**: AI services, development tools
- **Separate**: User data, authentication, database

## 📋 Production Environment Variables

### **Development (.env.local)**
```env
# Development Environment
NEXT_PUBLIC_PRODUCT_TIER=enterprise
NEXT_PUBLIC_APP_NAME=AccountingAI Pro

# Development Database
DATABASE_URL=postgresql://dev_user:password@dev-host/accounting_dev

# Development Firebase
NEXT_PUBLIC_FIREBASE_PROJECT_ID=accounting-dev-123
FIREBASE_ADMIN_PROJECT_ID=accounting-dev-123

# Shared AI Services (same for both)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
```

### **Production MVP (Vercel Environment)**
```env
# Production MVP Configuration
NEXT_PUBLIC_PRODUCT_TIER=mvp
NEXT_PUBLIC_APP_NAME=ExpenseAI

# Production Database (NEW)
DATABASE_URL=postgresql://prod_user:password@prod-host/expense_ai_prod

# Production Firebase (NEW PROJECT)
NEXT_PUBLIC_FIREBASE_PROJECT_ID=expense-ai-prod-456
FIREBASE_ADMIN_PROJECT_ID=expense-ai-prod-456
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...prod...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...prod...\n"
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@expense-ai-prod-456.iam.gserviceaccount.com

# Shared AI Services (SAME as development)
ANTHROPIC_API_KEY=sk-ant-...  # Same key
OPENAI_API_KEY=sk-proj-...    # Same key

# Production-specific
NEXT_PUBLIC_VERCEL_URL=https://expense-ai.vercel.app
NODE_ENV=production
```

## 🗄️ Database Setup

### **Option 1: New Neon Database (Recommended)**
```bash
# Create new production database
# 1. Go to Neon Console
# 2. Create new project: "expense-ai-production"
# 3. Get new DATABASE_URL
# 4. Run migrations
```

### **Option 2: Same Database, Different Schema**
```sql
-- Create production schema in existing database
CREATE SCHEMA expense_ai_prod;
-- Update your migrations to use this schema
```

## 🔥 Firebase Setup

### **Create New Firebase Project:**
1. Go to Firebase Console
2. Create new project: `expense-ai-production`
3. Enable Authentication
4. Enable Firestore
5. Enable Storage
6. Get new configuration keys

### **Benefits:**
- ✅ **User Isolation**: Production users separated from dev
- ✅ **Clean Analytics**: Separate user metrics
- ✅ **Security**: Production data protection
- ✅ **Billing**: Separate Firebase billing

## 💰 Cost Considerations

### **Shared Services (Cost-Effective):**
- **AI APIs**: ~$50-200/month depending on usage
- **Development Tools**: Usually free tiers

### **Separate Services (Data Protection):**
- **Neon Database**: $19/month for production tier
- **Firebase**: Pay-as-you-go (likely $10-50/month for MVP)
- **Vercel**: $20/month for Pro features

### **Total Estimated Cost: $100-300/month for MVP**

## 🚀 Migration Strategy

### **Phase 1: MVP Launch**
```bash
# Use hybrid approach above
# Separate user data, shared AI services
```

### **Phase 2: Scale (Later)**
```bash
# If needed, separate AI services for better tracking
# Add dedicated infrastructure
# Implement multi-region deployment
```

## 🛡️ Security Benefits

### **Development Environment:**
- Safe for testing and experimentation
- Can use test data
- No real user impact

### **Production Environment:**
- Real user data protection
- GDPR/compliance ready
- Audit trails separated
- Backup strategies independent

## 📊 Monitoring & Analytics

### **Separate Tracking:**
- **Development**: Internal metrics, error tracking
- **Production**: User analytics, conversion metrics
- **AI Usage**: Can be tracked separately per environment

## 🔄 Deployment Workflow

```bash
# Development work
git add .
git commit -m "Enhanced receipt processing"

# Deploy to both environments
./push-to-both.sh

# Vercel automatically deploys:
# - Development: Full features with dev environment
# - Production: MVP features with production environment
```
