
# YFF Token Engine — Architecture v2 (Plain‑English Version)
_Last updated: 2025‑02‑07_

This document explains **what the Token Engine is**, **how it works**, and **where it plugs into Your Friend Fido**, without going deep into code. It is written so that product managers, designers, and high‑level engineers can all understand the system’s purpose and behavior.

It corresponds 1:1 with the Developer‑Ready version, but hides most of the implementation detail.

---

# 1. What the Token Engine Does

The Token Engine allows YFF to insert **personalized content** into newsletters based on where each subscriber lives.

Example use cases:
- Show **how your members of Congress voted** on a bill  
- Insert **county- or city-specific information**  
- Insert **ZIP‑level alerts** (future)  
- Insert **state-level statements or summaries**

A content creator writes a newsletter like this:

> _“Here’s how your House member voted: [[CV_HR4405_2025_11_18]]”_

When the newsletter is sent:
- Each subscriber receives **their own representative’s vote**, not a national list.
- YFF automatically picks the correct row of data based on each subscriber’s geography.

This is the entire purpose of the Token Engine:
> **Turn one generic newsletter into thousands of personalized versions.**

---

# 2. Two Kinds of Tokens (Important!)

There are **two types of tokens** inside YFF:

### 2.1 Built‑in Tokens (already exist today)
Examples:
- `[[DELEGATION]]` → inserts both senators + representative  
- `[[EMAIL]]` → the recipient’s email  
- `[[JOB_ID]]`, `[[BATCH_ID]]` → internal tracking tokens  

These are produced by **code**, not by uploading a dataset.

### 2.2 New Dataset‑Driven Tokens (what we are adding)
Examples:
- `[[CV_HR4405_2025_11_18]]`  
- `[[CV_HR4405_2025_11_18_SEN1]]`  
- `[[CV_HR4405_2025_11_18_SEN2]]`  

These come from **CSV uploads** of structured data.

Both use the same syntax:  
> **`[[TOKEN_KEY]]`**

And both go through the same token resolver.

---

# 3. Why This Matters for YFF MVP

This feature is the core of YFF’s value proposition:

- Writers create a newsletter **once**  
- They embed tokens like `[[CV_BILL_2025]]`  
- YFF automatically personalizes the message for each subscriber  
- Readers feel like the email is written specifically for them  
- Content creators don’t need to maintain 50 different lists  

This also enables:
- State‑wide newsletters  
- National newsletters  
- Newsletters from campaigns, advocacy groups, or media partners  
- Anything involving geographic variation

---

# 4. What Data Gets Uploaded

Admins upload a CSV file that looks like:

| dataset_id | token_key | row_uid | value_html | value_text | ocd_id | senate_position |
|------------|-----------|---------|------------|------------|--------|------------------|
| CV_HR4405_2025_11_18 | CV_HR4405_2025_11_18 | A000055 | `<p>Rep Aderholt voted YES</p>` | Rep Aderholt voted YES | ocd-division/... | (blank) |
| CV_HR4405_2025_11_18 | CV_HR4405_2025_11_18_SEN1 | B001230 | `<p>Sen Baldwin voted NO</p>` | Sen Baldwin voted NO | ocd-division/... | 1 |

Each row represents the **content to show for one geography** (a congressional district, a state, etc.).

YFF stores this in a dedicated database table.  
No editing is required inside YFF — creators update these datasets by uploading new CSVs.

---

# 5. The Two New Database Tables (Simple Version)

### 5.1 Token Dataset Table  
Stores metadata about a dataset, like:

- dataset_id (e.g., CV_HR4405_2025_11_18)
- description
- upload time

### 5.2 Token Row Table  
Stores each individualized fragment:

- token_key  
- value_html (for email body)  
- value_text (for subject lines and plain text fallback)  
- ocd_id (who this row applies to)  
- senate_position (optional, for splitting senators into SEN1/SEN2)

These tables do **not** affect your existing content ingestion tables.

---

# 6. How YFF Decides Which Token Row to Use

When sending a newsletter:

1. YFF loads the subscriber’s profile.
2. It checks the subscriber’s **first OCD ID** (`ocd_ids[0]`).
3. It finds the matching row in the token table.
4. It replaces `[[TOKEN_KEY]]` with:
   - the row’s **HTML** in the body  
   - the row’s **plain text** in the subject  

If no match is found:
- The token is replaced with an **empty string** (MVP behavior).  
Later we may add logging for missing data.

---

# 7. Where Token Resolution Happens in the Code

YFF already has a token resolver for built‑in tokens.  
The new system simply plugs into that same mechanism.

This happens inside:

```
/api/send/personalize/route.ts
```

The system already passes:
- user email  
- user OCD IDs  
- job + batch metadata  
to the resolver.

We are **adding one more branch**:
- if token is not built-in → look it up in the database.

No other system needs to change.

---

# 8. How Content Creators Use Tokens

### Step 1: Upload the token dataset  
E.g., “House vote on H.R.4405 — Nov 18 2025”.

### Step 2: View tokens on the Token Library screen  
E.g.:
- `CV_HR4405_2025_11_18`
- `CV_HR4405_2025_11_18_SEN1`
- `CV_HR4405_2025_11_18_SEN2`

### Step 3: Insert these tokens into:
- newsletter **subject**  
- newsletter **body**  

### Step 4: Send newsletter → YFF personalizes everything.

---

# 9. Admin UI (What We Are Adding)

### 9.1 Token Upload Screen
Admins can:
- upload CSV
- see how many rows were inserted/updated
- see which tokens were created
- test a token by entering a user email

### 9.2 Token Library Screen
Admins can:
- search by token_key or dataset_id
- see all tokens available
- download datasets
- see dataset descriptions
- view upload timestamps

No editing or deletion UI is needed for MVP.

---

# 10. Validation Rules (Simple)

- **token_key** must be ALL CAPS with underscores  
- **token_key** cannot be a reserved name:
  - `DELEGATION`, `EMAIL`, `JOB_ID`, `BATCH_ID`, etc.
- **value_text** cannot contain `<` or `>`  
- **ocd_id** must start with `ocd-division/`  
- Extra CSV columns are ignored  
- Missing required fields cause the upload to fail  

---

# 11. What We Are *Not* Doing in MVP

To keep this simple and fast:

- No token editing UI  
- No fallback rules like “use county-level token if district-level not found”  
- No multi-row newsletters  
- No complex versioning or drafts  
- No automated ingestion from Congress APIs (future upgrade)  
- No token previews inside the newsletter editor  

The focus is entirely on:
> **Uploading token data → using it in newsletters → sending personalized content.**

---

# 12. Summary

The Token Engine gives YFF the ability to:

- send highly personalized civic content  
- scale a single newsletter to national audiences  
- support federal, state, county, city, and ZIP personalization  
- create a library of reusable geographic content fragments  

It does this with:
- two new database tables  
- one new upload path  
- one new admin screen  
- a small extension to the existing token resolver  

This design is simple, additive, and low‑risk — and gives YFF its most powerful feature.

---

If you'd like, I can now:
- Produce a diagram‑based version  
- Draft the Developer‑Ready MD (v2)  
- Produce a Cursor “implementation brief” for engineering
