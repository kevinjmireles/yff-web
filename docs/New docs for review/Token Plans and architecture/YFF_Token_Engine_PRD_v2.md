# YFF Token Engine MVP — PRD (v2 Updated for Generalized Geo Support)

_Last updated: 2025-02-07_

# 1. Objective
Enable YFF to insert personalized content into newsletters using **dynamic token datasets** matched to each subscriber’s **geography**.  
The Token Engine is a **general-purpose geo-personalization system**, not limited to congressional use cases.

The first dataset will support congressional votes, but the architecture must support:
- ZIP-based personalization  
- City/place content  
- County or state-specific inserts  
- School districts  
- Any OCD‑supported or custom geographic layer  

---

# 2. Scope (MVP)
## In Scope
- Token dataset uploads  
- Token dataset storage + metadata  
- Token preview/testing  
- Token list/search/download UI  
- Token resolution engine (OCD + geo_level/geo_code capable)  
- Tokens in newsletter HTML and title  
- Single-row newsletter uploads  

## Out of Scope
- Multi-row newsletters  
- Token editing  
- Replace modes for token datasets  
- Non-geo personalization logic  
- WYSIWYG editors  
- Automated vote ingestion  

---

# 3. Key Concepts

## Token Dataset (CSV)
A dataset defines *how to personalize content for each geography*.

Required columns:
- dataset_id  
- row_uid  
- token_key  
- value_html  
- value_text  
- ocd_id (for precise geo matching)  
Optional:
- senate_position (for federal Senate)  
- geo_level + geo_code (for ZIP, city, county, etc.)

## Token
Inserted in newsletter HTML/title:
```
{{TOKEN_KEY}}
```
Resolved at send-time based on subscriber geography.

## Newsletter Content
A single CSV row with:
- external_id  
- title (tokens allowed)  
- html (tokens allowed)  

---

# 4. User Roles
### Content Creator
- Uploads token datasets  
- Tests token behavior  
- Inserts tokens into newsletter HTML/title  
- Uploads newsletter CSV  
- Sends test + final email  

### Admin
- Reviews token datasets  
- Downloads datasets for debugging  

---

# 5. Workflows

## Workflow 1: Upload Token Dataset
1. User selects CSV
2. Adds optional dataset_description
3. System extracts dataset_id from CSV
4. Upserts metadata + rows
5. Displays:
   - dataset_id  
   - dataset_description  
   - upload timestamp  
   - row counts  
   - tokens generated  
6. User tests tokens using subscriber email

_No Replace Mode._

## Workflow 2: Create Newsletter
1. User browses token library  
2. Copies token_keys  
3. Inserts into newsletter content  
4. Uploads newsletter CSV (single row)  
5. Sends test email  
6. Sends broadcast  

---

# 6. Functional Requirements

## 6.1 Token Upload UI
- CSV upload  
- dataset_description (optional)
- After upload: summary screen  
- Token test panel (email + token selector)

## 6.2 Token Library UI
- Lists all token_keys, datasets, row counts  
- Search across:
  - token_key  
  - dataset_id  
  - dataset_description  
- Tooltip with full description  
- Download dataset (full CSV)  
- Download All Datasets  

## 6.3 Token Resolution Engine
### Inputs:
- token_key  
- subscriber (must include ocd_id)

### Logic:
1. Load rows for token_key
2. If `_SEN1` or `_SEN2` → filter by senate_position
3. Try OCD match:  
   ```
   row.ocd_id == subscriber.ocd_id
   ```
4. If unavailable and geo_level/geo_code exist:
   - Apply geo matching rules  
5. Return:
   - value_html (body)  
   - value_text (title)  

### Failure handling:
- No subscriber → empty string  
- No match → empty string  
- Invalid token → empty string  

This engine supports:
- Congressional datasets  
- ZIP → geo_level=zip, geo_code=43215  
- City → geo_level=place, geo_code=columbus,oh  
- County → geo_level=county, geo_code=39049  
- State → geo_level=state, geo_code=OH  
- Any future custom geography  

## 6.4 Newsletter Rendering
Replace tokens in:
- HTML → use value_html  
- Title → use value_text  

---

# 7. Data Requirements

## content_token_datasets
- dataset_id (PK)  
- dataset_description  
- uploaded_at  

## content_dataset_rows
- dataset_id  
- row_uid  
- token_key  
- value_html  
- value_text  
- ocd_id  
- senate_position  
- updated_at  

---

# 8. Technical Requirements

### CSV Validation
Must contain:
- dataset_id  
- row_uid  
- token_key  
- value_html  
- value_text  
- ocd_id  

### Security
- No dataset deletion  
- Subscriber must be entered manually  
- UTF-8 safe (ASCII hyphens preferred)  

### Search
Single search bar across:
- token_key  
- dataset_id  
- dataset_description  

### Download Functions
1. Download full dataset (CSV)  
2. Download all datasets (CSV summary)  

---

# 9. Acceptance Criteria

### Upload Token Dataset
- AC1: Reads dataset_id from CSV  
- AC2: Upserts rows by (dataset_id, row_uid)  
- AC3: Displays upload summary  
- AC4: Allows token testing  

### Token Library
- AC5: Search works across all fields  
- AC6: Description tooltip works  
- AC7: Dataset CSV downloads correctly  
- AC8: “Download all datasets” works  

### Token Resolution
- AC9: House tokens resolve correctly  
- AC10: SEN1/SEN2 resolve correctly  
- AC11: ZIP/city/county tokens work if present  
- AC12: Missing match returns empty string  
- AC13: Title tokens use value_text  

### Newsletter Rendering
- AC14: Tokens replaced in HTML  
- AC15: Tokens replaced in title  
- AC16: No HTML corruption in final email  

---

# 10. Non-Goals
- Token editing form  
- Multi-row newsletters  
- Replace mode for token datasets  
- WYSIWYG  
- Automated ingestion of vote data  

---

# 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Wrong dataset_id in CSV | Reject upload |
| Missing ocd_id | Return empty string |
| Token typos | Provide Token Library for copy/paste |
| Data overwrite | Only allow upsert, no replace |
| Encoding errors | Use ASCII hyphens, enforce UTF-8 |

---

# 12. Summary
This PRD defines the **Token Engine MVP**, enabling YFF to deliver personalized civic content starting with congressional votes but architecturally supporting **ANY geo-level** (ZIP, county, city, state, etc.).

The design is:
- Simple  
- Modular  
- Safe  
- Future-proof  
- Easy for content creators  
- Scalable for new datasets  

# End of Document
