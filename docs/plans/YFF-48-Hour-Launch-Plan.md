# YFF — 48-Hour Launch Plan
**Date:** 2025-09-26  
**Objective:** Prove the product end-to-end: people can sign up, you can send a dataset as a real email campaign, with caps and dedup to limit risk.

---

## 🔑 Core Deliverables (Next 2 Days)
1. **SendGrid Dynamic Template (MVP)**  
2. **Execute API** (`/api/send/execute`) → batches, dedup, payload to Make  
3. **Make Scenario** → webhook → SendGrid → callback  
4. **Callback API** (`/api/provider/callback`) → update delivery history & provider events  
5. **Signup Polish** (privacy link + enrichment works)  
6. **Env flags & caps** → safe rollout

---

## 📋 Step-by-Step

### 1) SendGrid Dynamic Template
- [ ] Create one **dynamic template** with fields: `first_name`, `unsubscribe_url`, `body_html`  
- [ ] Add footer w/ unsubscribe link  
- [ ] Add placeholder `{{{body_html}}}` for per-user content  

**Acceptance:**  
- Preview renders tokens correctly  
- Test email looks correct  

---

### 2) Execute API (`/api/send/execute`)
- [ ] Inputs: `job_id`, `mode: 'test' | 'cohort'`, `emails?: string[]`  
- [ ] Select recipients:  
  - **test:** only provided emails (lookup or create profiles)  
  - **cohort:** first `N = MAX_SEND_PER_RUN` active profiles  
- [ ] Dedup against `delivery_history`  
- [ ] Build JSON payload:  
  ```json
  {"job_id":"...","batch_id":"...","template_id":"...","recipients":[{"email":"a@b.com","first_name":"A","unsubscribe_url":"...","body_html":"<p>...</p>"}]}
  ```
- [ ] POST to **Make webhook**  
- [ ] Insert `delivery_history` rows with `status='queued'`  
- [ ] Return counts: `selected, deduped, queued`  

**Acceptance:**  
- Endpoint never exceeds `MAX_SEND_PER_RUN`  
- Dedup works (already-sent users skipped)  
- Returns correct counts  

---

### 3) Make Scenario
- [ ] Webhook → validate shared token  
- [ ] Map payload to SendGrid “Send Email (Dynamic Template)”  
- [ ] On success/failure → POST back to `/api/provider/callback`  

**Acceptance:**  
- Make receives payload and sends via SendGrid  
- Callback hits your API with correct fields  

---

### 4) Callback API (`/api/provider/callback`)
- [ ] Upsert into `provider_events`  
- [ ] Update `delivery_history` → `queued → delivered | failed`  
- [ ] Include error text if provided  

**Acceptance:**  
- Job detail shows **queued / delivered / failed** counts updating  
- Logs show requestId correlation works  

---

### 5) Signup Polish
- [ ] `/signup` → email + address → Civic API enrich → insert `profiles`  
- [ ] Add inline privacy text + `/privacy-policy` static route  
- [ ] Store `ocd_ids` in profiles (SSoT)  

**Acceptance:**  
- Signup works on desktop + mobile  
- Profile row created with `email`, `ocd_ids`  

---

### 6) Env Flags & Safety
- [ ] `FEATURE_TEST_SEND=on`  
- [ ] `FEATURE_FULL_SEND=off` (enable only after clean cohort)  
- [ ] `MAX_SEND_PER_RUN=100`  
- [ ] `MAKE_WEBHOOK_URL=https://...`  
- [ ] `MAKE_SHARED_TOKEN=...` (checked by API)  

**Acceptance:**  
- Test mode works with hand-picked emails  
- Cohort mode capped at 100  
- Feature flags toggle behavior as expected  

---

## 🧪 Test Plan (Day 2)
1. **Template sanity check**: Preview + send to yourself.  
2. **Test run**: `/api/send/execute` with `mode="test"` and 2 addresses → delivered.  
3. **Cohort run**: 25 real users → delivered; counts update correctly.  
4. **Dedup check**: Re-run same `job_id` → no new `queued`.  

---

## 🔒 Parallel Security-Lite (don’t block launch)
- [ ] Confirm **no Edge Functions** deployed; remove `EDGE_SHARED_SECRET`.  
- [ ] Keep **RLS ON**; all writes only via server APIs.  
- [ ] Drop `SECURITY DEFINER` views (compute geo in API instead).  

---

## ✅ Definition of Done
- Users can sign up and appear in `profiles` with OCD IDs.  
- Admin can create a job and run `/api/send/execute`.  
- Test emails arrive with correct tokens.  
- Cohort of real users receives email, capped + deduped.  
- Delivery stats update via callbacks.  
- Safety switches (`MAX_SEND_PER_RUN`, feature flags) protect from runaway sends.  

---

**End of 48-Hour Plan**
