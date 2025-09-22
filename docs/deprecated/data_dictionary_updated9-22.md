# Data Dictionary — MVP
_Last updated: 2025-09-22_

This dictionary describes the main tables used in the MVP.

---

## subscribers
| Column | Type | Notes |
|--------|------|-------|
| id | uuid pk | |
| email | text unique | |
| address | text | Raw input |
| zip | text | 5-digit, padded |
| ocd_ids | text[] | Enriched list of OCD IDs (country, state, county, city, cd, sldu, sldl) |
| status | text | pending/confirmed |
| confirmation_token | uuid | |
| unsubscribe_token | uuid | |
| created_at | timestamptz | |

---

## profiles
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid pk | |
| email | text unique | |
| address | text | |
| zipcode | text | |
| ocd_ids | text[] | |
| ocd_last_verified_at | timestamptz | |
| created_at | timestamptz | |

---

## content_items
| Column | Type | Notes |
|--------|------|-------|
| id | uuid pk | |
| content_id | text | Stable slug |
| email_subject | text | |
| title | text | |
| subtitle | text | optional |
| byline | text | optional |
| body_markdown | text | Markdown with tokens |
| scope_value | text | OCD ID target or blank for global |
| send_after | timestamptz | optional |
| tags | text | optional, comma-separated |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## geo_metrics
Generic table for location-based personalization.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid pk | |
| geo_type | text | 'zip' (MVP); future: 'county','city','cd','sldu','sldl','state' |
| geo_id | text | canonical ID per type (zip=5-digit, county=FIPS, cd=OCD, etc.) |
| as_of | date | latest record wins |
| metrics | jsonb | Arbitrary key-value fields |
| created_at | timestamptz | |

Unique index on (geo_type, geo_id, as_of).

---

## officials
| Column | Type | Notes |
|--------|------|-------|
| official_id | uuid pk | |
| bioguide_id | text unique | optional |
| full_name | text | |
| party | text | |
| office_type | text | us_senate, us_house |
| state | text | |
| district | int | |
| ocd_division_id | text | |
| is_active | bool | |

---

## official_contacts
| Column | Type | Notes |
|--------|------|-------|
| contact_id | uuid pk | |
| official_id | uuid fk | |
| method | text | phone, email, webform, address, twitter, facebook |
| value | text | |
| display_order | int | |
| is_active | bool | |

---

## delivery_history
| Column | Type | Notes |
|--------|------|-------|
| id | uuid pk | |
| subscriber_id | uuid fk | |
| content_id | text | |
| channel | text | email/web |
| batch_id | text | |
| status | text | queued/sent/failed |
| provider_message_id | text | optional |
| error | text | optional |
| sent_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## dead_letters
| Column | Type | Notes |
|--------|------|-------|
| id | uuid pk | |
| topic | text | |
| payload | jsonb | |
| error | text | |
| created_at | timestamptz | |
