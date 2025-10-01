# 🐶 LLM Build Guide for Your Friend Fido (Updated)

_Last updated: 2025-10-01_

---

## 🎯 Philosophy
- **Simplicity First**: Prefer the smallest working slice that’s easy to extend and maintain.
- Skip non-critical validations, abstractions, or edge cases. The first version should be as close to a working demo as possible.
- Always create a **plan** and get **approval** before making code changes.
- Clarity > cleverness. Be explicit and boring if needed. Explain for non-technical audience. 

---

## ✅ Development Rules

### 1. Scope
- Implement the **smallest testable slice** of functionality.
- If unclear or risky, **ask questions first** (see Ask section).
- Always draft a short **implementation plan** for approval before coding.

### 2. Validation
- Validate only **required fields** (e.g., `email`, `id`).
- Defer extra validation unless a bug or explicit requirement demands it.

### 3. Logging
- Use `console.error()` or `console.log()` sparingly.
- Log **counts, identifiers, or statuses**.
- Avoid logging large data structures unless actively debugging.

### 4. File Organization
- Prefer **one file per feature slice**.
- Keep in the same file until it exceeds ~100 lines or becomes confusing.

### 5. Feature Flags
- Use `FEATURE_*` flags only if clearly needed.
- If unsure, ship the simplest working version without a flag.

### 6. Commits
- Format: `<feat|fix|chore>: short description`.
- Scope is optional. Keep short and clear.

---

## 🔒 Supabase Rules
- Always respect RLS (Row Level Security).
- Use **policies** instead of bypassing security.
- If you need special access, propose a **migration + policy update** plan first.

---

## 🧪 Testing Rules
- Always write at least **one happy-path test**.
- Do not over-test edge cases unless explicitly requested.
- Use **Vitest** with simple asserts.

---

## 📬 Delivery Rules
- Default delivery handled in **Make.com** unless code-based solution is required.
- Imports must be **idempotent**.
- Ensure **deduplication** (no subscriber receives the same content twice).

---

## 📖 Documentation Rules
- Every file starts with a **header comment** describing its purpose.
- Add **doc comments** for functions.
- Write explanations for non-obvious logic.

---

## 💬 Ask Section
- If unclear or risky, **ask before coding**.
- Err on the side of asking too many questions rather than too few.

---

# 🗂 Repo Integration Checklist

1) **Add file**
   - `docs/dev/LLM-guide.md` (this document)
   - Link it from `README.md` → _Developer Guide_

2) **Cursor**
   - Update project/system instructions with the “Cursor Project Instructions” block above.

3) **Feature flags**
   - In `.env.local` add booleans, e.g.:
     ```env
     FEATURE_DELEGATION_TOKENS=true
     FEATURE_ADMIN_IMPORTS=true
     ```

4) **Secrets**
   - Use `.env.local` for local dev; configure Vercel/Supabase project env vars for deploy.
   - Never log actual secret values; only log presence (e.g., `!!process.env.SENDGRID_API_KEY`).

5) **Migrations**
   - All schema changes via SQL/migrations committed to repo.

6) **Idempotency**
   - Batch jobs must be repeatable without duplicate side effects; write to `delivery_history`/logs first.

7) **Commits**
   - Small, focused commits; message format: `feat: <scope> - <what>`, `fix:`, `chore:`.

---

# Example: Minimal Supabase Pattern

```ts
// file: src/server/getLatestContent.ts
// Purpose: Fetch latest visible content for a given user scope. Called by /api/content/latest.

import { createClient } from '@supabase/supabase-js'

/**
 * getLatestContent
 * Fetch latest visible content by scope. Returns items or throws an Error.
 */
export async function getLatestContent(scope: string) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

  const { data, error } = await supabase
    .from('content_items')
    .select('id, title, created_at')
    .eq('visibility', 'public')
    .contains('target_scopes', [scope])
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('getLatestContent failed', error)
    throw new Error('Could not load content')
  }

  console.log('getLatestContent rows', data?.length ?? 0)
  return data
}

/* Test (happy path):
(async () => {
  const rows = await getLatestContent('ocd-division/country:us/state:oh')
  console.log(rows?.[0])
})()
*/
```

---

# Example: Idempotent Send (Pseudo)

```ts
// file: src/server/sendEmailBatch.ts
// Purpose: Idempotent batch send with logging before/after provider call.

/**
 * sendEmailBatch
 * - Skips recipients already recorded in delivery_history for this content_id
 * - Records attempt, then provider response, ensuring idempotency
 */
export async function sendEmailBatch(contentId: string) {
  // 1) select recipients not yet sent
  // 2) insert attempt logs with unique constraint (content_id + recipient_id)
  // 3) call provider
  // 4) update logs with status
}
```

---

# Notes
- Keep files self‑describing; assume an AI may open this file in isolation.
- Prefer clarity over cleverness.
- When in doubt: ship a smaller slice, with one test and clear logs.

---

## 🗂 Cursor Project Instructions (Copy/Paste Block)
```
You are an AI pair programmer working in Cursor on the Your Friend Fido project. Follow these rules:
- Always propose a **step-by-step plan** and get approval before coding.
- Implement the smallest testable slice.
- Validate only required fields.
- Log only identifiers, counts, or statuses.
- Keep code in one file until it exceeds ~100 lines.
- Use feature flags only if explicitly requested.
- Always write one happy-path test.
- Each file requires a header comment.
- Commit format: <feat|fix|chore>: short description.
- If unclear or risky, ask questions first.
```

