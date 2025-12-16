# YFF Token Engine MVP — Wireframes & Overall Plan (v1)

_Last updated: 2025‑02‑07_

This document contains:
1. **Wireframe Set (Token Upload + Token Library)**
2. **Overall MVP Implementation Plan**

It will serve as the reference spec for engineering, design, and testing.

---

# 1. WIREFRAMES (MVP)

## 1.1 Token Upload — Wireframe v3

```
---------------------------------------------------------
| Admin Panel  >  Tokens  >  Upload Token Dataset        |
---------------------------------------------------------

Upload Token Dataset
---------------------------------------------------------

Download CSV Template  [link]

1) Choose CSV file:
[ Choose File ]   No file chosen

2) Dataset Description (optional)
[ e.g., House & Senate vote on HR 4405 (Epstein Files) ]

---------------------------------------------------------
[ Upload Token Dataset ]
---------------------------------------------------------

After Upload:
---------------------------------------------------------
Dataset ID: CV_HR4405_2025_11_18
Dataset Description: House & Senate vote on HR 4405 (Epstein Files)
Uploaded At: 2025-02-07 14:33 ET
Total Rows Imported: 535

Tokens Created:
  • CV_HR4405_2025_11_18        (435 rows)
  • CV_HR4405_2025_11_18_SEN1   (50 rows)
  • CV_HR4405_2025_11_18_SEN2   (50 rows)

Test a Token:
---------------------------------------------------------
Token Key:
[dropdown: CV_HR4405_2025_11_18 ▾]

Subscriber Email:
[ kevin@example.com ]

[ Test Token ]

Preview:
----------------------------------------
<p>US Senator Tammy Baldwin (D-WI)...</p>
----------------------------------------

Back to Token Library  [button]
```

### Key Notes
- `dataset_id` comes **only** from CSV
- Optional dataset_description stored once in metadata
- Token preview shows **value_html** and **value_text** only
- No Replace Mode (always UPSERT by `(dataset_id, row_uid)`)

---

## 1.2 Token Library — Wireframe v3

```
---------------------------------------------------------
| Admin Panel  >  Tokens                                 |
---------------------------------------------------------

Token Library
---------------------------------------------------------

Actions:
[ Download All Datasets (CSV) ]

Search: [ type to filter tokens or datasets... ]
(searches token_key, dataset_id, and dataset_description)

Columns:
Token Key | Dataset ID | Rows | Description | Uploaded At | Actions
-----------------------------------------------------------------------------------------
CV_HR4405_2025_11_18        | CV_HR4405_2025_11_18 | 435 | House vote on HR… [?] | 2025-02-07 14:33 ET | [Download Dataset]
CV_HR4405_2025_11_18_SEN1   | CV_HR4405_2025_11_18 | 50  | Senate vote on HR… [?] | 2025-02-07 14:33 ET | [Download Dataset]
CV_HR4405_2025_11_18_SEN2   | CV_HR4405_2025_11_18 | 50  | Senate vote on HR… [?] | 2025-02-07 14:33 ET | [Download Dataset]

CV_GENERIC_2025_01_01       | CV_GENERIC_2025_01_01 | 435 | Generic template… [?] | 2025-02-03 10:12 ET | [Download Dataset]
CV_GENERIC_2025_01_01_SEN1  | CV_GENERIC_2025_01_01 | 50  | Generic template… [?] | 2025-02-03 10:12 ET | [Download Dataset]
CV_GENERIC_2025_01_01_SEN2  | CV_GENERIC_2025_01_01 | 50  | Generic template… [?] | 2025-02-03 10:12 ET | [Download Dataset]

Pagination:  ◀ Prev  1  2  3  Next ▶
```

### Key Notes
- "?" tooltip shows full dataset_description
- Description preview limited to ~128 chars
- Individual dataset download
- "Download All Datasets" exports overview CSV
- Simple timestamp, no relative date formatting

---

# 2. OVERALL MVP IMPLEMENTATION PLAN

This plan organizes the Token Engine MVP into small, testable, Cursor-friendly components.

---

## 2.1 Data Model Updates

### New Table (recommended)
`content_token_datasets`
- dataset_id (PK)
- dataset_description (text)
- uploaded_at (timestamp)

### Updates to `content_dataset_rows`
- Ensure fields exist:
  - dataset_id
  - row_uid
  - token_key
  - value_html
  - value_text
  - ocd_id
  - senate_position (optional, but recommended)

No geo_level or geo_code required for federal officials.

---

## 2.2 Token Upload Flow (Backend)

### Upon CSV upload:
1. Parse CSV
2. Validate required columns
3. Extract dataset_id from CSV
4. Insert/update record in `content_token_datasets` (description optional)
5. Upsert rows into `content_dataset_rows` keyed on:
   ```
   (dataset_id, row_uid)
   ```
6. Collect list of token_keys for summary
7. Return:
   - dataset_id
   - dataset_description
   - row counts per token_key
   - uploaded_at

### No destructive operations.  
Always upsert.

---

## 2.3 Token Resolution Logic

### `resolveToken(token_key, subscriber)`
1. Lookup rows where `token_key = token_key`
2. Identify subscriber’s `ocd_id`
3. Match row where row.ocd_id == subscriber.ocd_id
4. Return value_html (for body) or value_text (for title)

### Senate logic:
- SEN1 → filter where senate_position = 1
- SEN2 → senate_position = 2

### Failure Cases:
- No subscriber → return empty string
- No matched row → return empty string

All logic is deterministic and testable.

---

## 2.4 Token Test Endpoint

Input:
- token_key
- subscriber_email

Output:
- value_html
- value_text
- debugging info (optional)

---

## 2.5 Frontend Components

### Token Upload Screen
- File upload
- Description field
- Summary results
- Token preview tester

### Token List Screen
- Search across token_key, dataset_id, and description
- Tooltip with full dataset_description
- Download dataset
- Download all datasets

---

## 2.6 Newsletter Flow Integration

Creators:
1. Upload Token Dataset FIRST
2. See token_keys in Token Library
3. Insert token keys into newsletter HTML
4. Upload newsletter CSV (single-row)
5. Send test email

Newsletter title also supports tokens (value_text version).

---

## 2.7 Unit Tests (Vitest)

Tests to implement:
- resolves House tokens correctly
- resolves SEN1 vs SEN2
- resolves using subscriber.ocd_id
- handles missing subscriber
a gracefully
- handles malformed OCD IDs
- handles token not found
- preview endpoint returns expected structure

---

## 2.8 Non-goals (MVP exclusions)
- No static manual tokens
- No token editing UI
- No Replace Modes for token uploads
- No multi-row newsletter uploading
- No geo_level/geo_code resolution for federal tokens
- No WYSIWYG editor

---

# END OF DOCUMENT

