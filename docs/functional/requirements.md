# Functional Requirements — Your Friend Fido
Last updated: 2025-08-24  
Owner: Kevin Mireles  

This document is the **living truth** of what the system must do.  
- ✅ = completed  
- 🕒 = planned/next  
- ⏳ = future (not yet prioritized)  

**📚 V2.1 Implementation Status**: See [Signup & Enrichment](../V2_Requirements/yff-v2.1-01-signup.md), [Content Import](../V2_Requirements/yff-v2.1-02-content-import.md), [Assembly & Send](../V2_Requirements/yff-v2.1-03-send.md), and [Overall Plan](../V2_Requirements/yff-v2.1-04-overall-plan.md) for complete specifications.

---

## Core User Flows
- ✅ User signup with email + address → stored in Supabase
- ✅ Preferences + unsubscribe flow → linked in emails
- ✅ Admin campaign trigger → posts to Make webhook
- ✅ Personalized content by OCD ID (audience_filter using ocd_id) - **V2.1 implemented**
- ✅ CSV import via Make scenario (deduping + upsert) - **V2.1 implemented**
- ✅ Delivery tracking + event logging - **V2.1 implemented**
- ⏳ Admin UI for content templates

## Database Requirements
- ✅ `profiles` table with email/address/consent - **V2.1 implemented**
- ✅ `subscriptions` table with list_key + unsubscribed_at - **V2.1 implemented**
- ✅ `delivery_history` + `delivery_events` tables - **V2.1 implemented**
- ✅ Content slices with OCD-based personalization - **V2.1 implemented**

## Security & Compliance
- ✅ RLS enabled on Supabase - **V2.1 implemented**
- ✅ reCAPTCHA on signup - **V2.1 implemented**
- ✅ HMAC-based unsubscribe tokens - **V2.1 implemented**
- ✅ PII minimization and data retention policies - **V2.1 implemented**
- 🕒 Suppression sync with SendGrid
- 🕒 CAN-SPAM footer: mailing address in email template
- ⏳ GDPR/CCPA user export + deletion

## Admin & Ops
- ✅ Healthcheck endpoint
- ✅ Minimal admin page (campaign send trigger)
- ✅ Campaign audit trail and dead letter handling - **V2.1 implemented**
- 🕒 Delivery summary reporting
- ⏳ Multi-tenant support

---

## References
- **[V2.1 Signup & Enrichment](../V2_Requirements/yff-v2.1-01-signup.md)** - Complete signup flow specification
- **[V2.1 Content Import](../V2_Requirements/yff-v2.1-02-content-import.md)** - CSV import and validation system
- **[V2.1 Assembly & Send](../V2_Requirements/yff-v2.1-03-send.md)** - Newsletter assembly and delivery engine
- **[V2.1 Overall Plan](../V2_Requirements/yff-v2.1-04-overall-plan.md)** - Complete architecture and implementation guide
- **[V2.1 SQL Patch](../V2_Requirements/yff-v2.1_sql_patch.sql)** - Database schema and RLS policies
