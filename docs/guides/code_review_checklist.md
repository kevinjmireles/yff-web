# 🤖 LLM Code Review Checklist for Your Friend Fido (YFF)

**Project:** [Your Friend Fido \- Civic Newsletter Platform](https://github.com/kevinjmireles/Fido-email-router)  
**Commit:** `e22b14e` – “feat: complete YFF web signup interface with end-to-end testing”  
**Stack:** Next.js, Supabase, Google Civic API, SendGrid  
**Goal:** Help voters discover candidates and receive personalized civic newsletters based on their district.

---

## 🔍 Review Goals

Please review this app and codebase with a focus on the following areas:

---

### 🔐 1\. Security & PII Handling

- [ ] Are `.env` secrets (Supabase/SendGrid) protected?  
- [ ] Are email and address fields handled with privacy in mind?  
- [ ] Is user data encrypted or isolated appropriately?  
- [ ] Are there unsubscribe and confirmation flows?  
- [ ] Could the signup endpoint be abused or spammed?  
- [ ] Is user data isolated by **RLS policies** (no leaks of service role keys)?

---

### 🧼 2\. Code Simplicity & Maintainability

- [ ] Are utility functions clean and reusable?  
- [ ] Is the logic modular and readable by junior developers?  
- [ ] Is code structure consistent between frontend/backend?  
- [ ] Are file names and comments clear?  
- [ ] ​​Are **file names and header comments** clear (purpose \+ caller)?  
- [ ] Do **non-trivial functions** have doc comments?  
- [ ] Are **magic numbers avoided** (named constants used)?

---

### 🏗️ 3\. Architecture & Scaling

- [ ] Does the project structure scale to support admin, content tools, and public users?  
- [ ] Could the block-based content system scale to thousands of districts?  
- [ ] Is there a clean path to implement scheduling/automation?  
- [ ] Are there any unnecessary hardcoded assumptions?  
- [ ] Are **schema changes tracked via committed migrations/SQL files**?  
- [ ] Does all app code respect **RLS** (no bypass via service role)?  
- [ ] Are **incomplete features gated behind `FEATURE_*` flags**?  
      

---

### 🚨 4\. Error Handling & Edge Cases

- [ ] What happens when Civic API fails?  
- [ ] How are missing content blocks handled?  
- [ ] How are failed email deliveries managed?  
- [ ] Are user errors handled with useful feedback?

---

### 📤 5\. Deployment Readiness

- [ ] Any blockers for Vercel deployment?  
- [ ] Is the app's signup form spam-protected?  
- [ ] Are environment variables clearly documented?  
- [ ] Any performance or hosting red flags?

---

### 💡 6\. Bonus Suggestions

- [ ] Anything you'd refactor or simplify?  
- [ ] Any tech debt to eliminate now?  
- [ ] GDPR/privacy concerns to flag?  
- [ ] Better approaches to ingest or tag content?

---

### **📨 Email & Batch Jobs**

- [ ] Are batch jobs (imports, email sends) **idempotent** (safe to rerun)?  
      Is **logging written before/after provider calls** (to ensure traceability)?  
- [ ] Does **delivery history prevent duplicate sends**?

### **🧪 Testing**

- [ ] Is there **at least one happy-path test per PR or file**?

### **⚠️ Error Handling**

- [ ] Are errors surfaced with `console.error('Action failed: <plain English>', error)`?  
- [ ] Are **risks of data loss, security issues, or major UX confusion called out**, even if not fixed?

      ### **🤝 Collaboration**

- [ ] Is the code written so an **AI (or new developer) could understand it in isolation**?

## ✅ How to Run This Review

You can copy this into:

- Claude (Anthropic)  
- GPT-4 (OpenAI)  
- GitHub Copilot Chat  
- Or share with a human reviewer

Thanks for helping improve Your Friend Fido\! 🐾🇺🇸  
