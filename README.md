# Your Friend Fido

[![Docs](https://img.shields.io/badge/Docs-📖-blue)](/docs/README.md)

**Your Friend Fido** is a personalized civic engagement platform that delivers location-relevant news and civic updates to users based on their address and political jurisdiction.

## 🎯 **Project Overview**

This platform collects user addresses, resolves them to Open Civic Data (OCD) identifiers, and delivers personalized content about local government, elections, and civic issues that matter to each user's specific location.

## 📚 **Documentation**

### **Current Specifications (V2.1)**
- **[Signup & Enrichment](docs/V2_Requirements/yff-v2.1-01-signup.md)** - User signup flow and address enrichment
- **[Content Import](docs/V2_Requirements/yff-v2.1-02-content-import.md)** - CSV-based content authoring and import
- **[Assembly & Send](docs/V2_Requirements/yff-v2.1-03-send.md)** - Newsletter assembly and delivery engine
- **[Overall Plan](docs/V2_Requirements/yff-v2.1-04-overall-plan.md)** - Complete architecture and implementation guide

### **Database Schema**
- **[Consolidated SQL Patch](docs/V2_Requirements/yff-v2.1_sql_patch.sql)** - Complete database setup with RLS policies

### **Schema Documentation**
- **[Table Inventory](docs/functional/table_inventory.csv)** - Source of truth for database tables
- **[Data Dictionary](docs/functional/data_dictionary.md)** - Complete field-level documentation
- **[Excel Export](docs/exports/YFF_V2.1_Data_Dictionary.xlsx)** - Generated from CSV (run `npm run build:dict` to regenerate)

### **Legacy Documentation**
- **[Deprecated V2 Docs](docs/deprecated/)** - Previous versions (archived)

## 🚀 **Getting Started**

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🏗️ **Architecture**

- **Frontend**: Next.js 15 with App Router
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions)
- **Integration**: Make.com for workflow automation
- **Email**: SendGrid for delivery
- **Authentication**: Supabase Auth with RLS policies

## 🔒 **Security Features**

- Row Level Security (RLS) on all tables
- Service role access only for sensitive operations
- Rate limiting and reCAPTCHA protection
- HMAC-based unsubscribe tokens
- PII minimization and data retention policies

## 📖 **Learn More**

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 🚀 **Deploy on Vercel**

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
