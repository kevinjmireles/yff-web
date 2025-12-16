
# YFF Token Engine — Architecture v3 (MVP Subset Specification)
Version: 2025-12-08  
Status: Authoritative MVP Implementation Guide

## Purpose
Define the **minimal subset** of Architecture v3 required for the MVP Token Engine.  
Ensures:
- Full future compatibility  
- Minimal implementation complexity  
- Clear rules for TDD  
- Zero misalignment for Cursor or Claude  

---

# 1. Database Schema (MVP Subset)

## 1.1 Tables

### content_token_datasets
- dataset_id TEXT PRIMARY KEY  
- dataset_description TEXT  
- uploaded_at TIMESTAMPTZ DEFAULT now()  

### content_token_rows
- id UUID PRIMARY KEY DEFAULT gen_random_uuid()  
- dataset_id TEXT NOT NULL REFERENCES content_token_datasets(dataset_id) ON DELETE CASCADE  
- row_uid TEXT NOT NULL  
- token_key TEXT NOT NULL  
- value_html TEXT NOT NULL  
- value_text TEXT NOT NULL  
- ocd_id TEXT NOT NULL  
- senate_position INT  
- created_at TIMESTAMPTZ DEFAULT now()  
- updated_at TIMESTAMPTZ DEFAULT now()  

## 1.2 Indexes
- token_key  
- ocd_id  
- token_key + ocd_id  
- dataset_id  
- UNIQUE(dataset_id, row_uid)

## 1.3 Constraints
- token_key must match ^[A-Z0-9_]+$  
- ocd_id must start with 'ocd-division/'  
- value_text must not contain < or >  
- senate_position must be NULL, 1, or 2  

---

# 2. MVP Token Resolution Algorithm

Inputs:
resolveToken(tokenKey, datasetId, subscriberPrimaryOcdId, mode)

### Steps:
1. Exact OCD match:
SELECT * FROM content_token_rows
 WHERE dataset_id = $1 AND token_key = $2 AND ocd_id = $3 LIMIT 1;

2. If token ends in _SEN1 → senate_position = 1  
3. If token ends in _SEN2 → senate_position = 2  
4. If no row found → return ""  

### Not implemented:
- geo fallback  
- priority  
- token aliasing  
- caching  

---

# 3. CSV Import Rules

Required columns:
- dataset_id  
- row_uid  
- token_key  
- value_html  
- value_text  
- ocd_id  
- senate_position (optional)

---

# 4. End-to-End Flow

1. Upload CSV → insert dataset + rows  
2. Template includes [[TOKENS]]  
3. For each subscriber:
   - primaryOcd = profiles.ocd_ids[0]  
   - resolve each token  
4. Missing tokens return ""  
5. Rendered template sent  

---

# 5. Acceptance Criteria

MVP is complete when:
- migration creates schema  
- CSV importer inserts valid rows, rejects invalid  
- resolver passes TDD tests  
- template substitution works  
- missing tokens return blank  

---

# END OF DOCUMENT
