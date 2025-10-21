# Personalization Authoring Guide

**Status:** ✅ Current (as of October 2025)
**Audience:** Content authors and campaign managers
**Purpose:** How to use content targeting features to deliver personalized messages

---

## Overview

The personalize API uses a **3-tier hierarchy** to select the most relevant content for each subscriber:

1. **Audience Rules** (most specific) - Custom targeting based on subscriber attributes
2. **Geographic Scope** (fallback) - Target by location (place → county → state)
3. **Global Content** (fallback) - No targeting, shown to everyone

---

## Content Targeting Knobs

### 1. Audience Rules (Most Specific)

**What it is:** Custom targeting rules stored in `metadata.audience_rule`

**When to use:** When you need precise control over who sees content based on subscriber attributes

**Format:** JSON object with `any` (OR logic) or `all` (AND logic) clauses

**Example:**
```json
{
  "any": [
    { "level": "state", "op": "eq", "value": "OH" },
    { "level": "state", "op": "eq", "value": "MI" }
  ]
}
```

**Supported fields:**
- `level`: `"state"`, `"county"`, or `"place"`
- `op`: `"eq"` (equals) or `"in"` (array membership)
- `value`: String or array of strings

**CSV Example:**
```csv
content_item_key,subject,body_html,metadata
vip-1,VIP Update,<p>Special update</p>,"{""audience_rule"":{""any"":[{""level"":""state"",""op"":""eq"",""value"":""OH""}]},""priority"":1}"
```

---

### 2. Geographic Scope (Fallback)

**What it is:** Location-based targeting using OCD division IDs or shorthand notation

**When to use:** When content is relevant to a specific geography

**Specificity hierarchy:**
- `place` (most specific) - City/town level
- `county` - County level
- `state` (least specific) - State level

**Shorthand formats:**
- `state:oh` - All of Ohio
- `place:columbus,oh` - Columbus, Ohio
- `county:39049` - FIPS code (Franklin County, OH)
- `county:franklin,oh` - County name format

**Full OCD ID format (also accepted):**
- `ocd-division/country:us/state:oh`
- `ocd-division/country:us/state:oh/place:columbus`

**CSV Example:**
```csv
content_item_key,subject,body_html,ocd_scope
columbus-1,Columbus Headline,<p>Local news</p>,place:columbus,oh
ohio-1,Ohio Update,<p>State news</p>,state:oh
```

**Matching logic:**
- Exact match: User in Columbus gets Columbus content
- Ancestor match: User in Columbus also matches Ohio state content
- Most specific wins when multiple match

---

### 3. Priority (Tiebreaker)

**What it is:** Numeric priority value in `metadata.priority`

**When to use:** When multiple items have the same specificity level

**How it works:**
- **Lower number = higher priority** (1 beats 10)
- Default priority: 9999 (if not specified)
- Used as tiebreaker when specificity is equal

**CSV Example:**
```csv
content_item_key,subject,body_html,ocd_scope,metadata
urgent-1,Urgent Columbus Update,<p>Breaking news</p>,place:columbus,oh,"{""priority"":1}"
regular-1,Columbus Newsletter,<p>Weekly update</p>,place:columbus,oh,"{""priority"":10}"
```

In this example, both target Columbus, but `urgent-1` wins because priority 1 < 10.

---

### 4. Body Content (HTML vs Markdown)

**What it is:** The actual message content

**Preference:** System uses `body_html` first, falls back to `body_md` if HTML is null

**When to use:**
- `body_html` - Preferred. Use when you have rich formatted content
- `body_md` - Fallback. Use for simple text or when only Markdown available

**CSV Example:**
```csv
content_item_key,subject,body_html,body_md
item-1,Update,<p>Rich <strong>HTML</strong> content</p>,
item-2,Fallback,,# Markdown heading\n\nSimple text
```

---

## Selection Algorithm

When a user requests personalized content, the system:

1. **Loads user context** (1 query)
   - Profile with OCD IDs
   - Geographic metrics (state, county, place)

2. **Loads all content** for the dataset (1 query)

3. **Filters by hierarchy** (in-memory, no DB calls)
   - Audience rule matches
   - OCD scope matches
   - Global content (no targeting)

4. **Picks best match** deterministically:
   - **Specificity:** audience_rule > place > county > state > global
   - **Priority:** Lower number wins (1 > 10)
   - **Recency:** Newer `created_at` wins ties

---

## Common Patterns

### Pattern 1: State-specific with global fallback
```csv
content_item_key,subject,body_html,ocd_scope,metadata
ohio-update,Ohio Headline,<p>Ohio content</p>,state:oh,"{""priority"":5}"
national-update,National Headline,<p>National content</p>,,"{""priority"":10}"
```

- Ohio subscribers get "Ohio Headline"
- Everyone else gets "National Headline"

### Pattern 2: Multi-city targeting
```csv
content_item_key,subject,body_html,metadata
cities-update,City Update,<p>Metro area news</p>,"{""audience_rule"":{""any"":[{""level"":""place"",""op"":""in"",""value"":[""columbus"",""cleveland"",""cincinnati""]}]},""priority"":1}"
```

- Shows to users in Columbus, Cleveland, or Cincinnati
- Uses `in` operator for multiple values

### Pattern 3: Priority override
```csv
content_item_key,subject,body_html,ocd_scope,metadata
breaking-columbus,BREAKING: Columbus,<p>Urgent</p>,place:columbus,oh,"{""priority"":1}"
regular-columbus,Columbus Newsletter,<p>Weekly</p>,place:columbus,oh,"{""priority"":100}"
```

- Both target Columbus
- Breaking news (priority 1) always wins

---

## Token Replacement

The system automatically replaces these tokens in content:

- `[[EMAIL]]` - Subscriber's email address
- `[[JOB_ID]]` - Send job UUID
- `[[BATCH_ID]]` - Batch UUID
- `[[DELEGATION]]` - Link to delegate action (if /delegate route exists)

**Example:**
```html
<p>Hi [[EMAIL]]! Click here to take action or [[DELEGATION]].</p>
```

Becomes:
```html
<p>Hi user@example.com! Click here to take action or
  <p>If you can't email right now, you can <a href="...">delegate this action</a>.</p>
</p>
```

---

## Validation & Testing

### Before importing:
1. ✅ Validate JSON in `metadata` column (use a JSON validator)
2. ✅ Check priority values are integers
3. ✅ Verify `ocd_scope` uses correct format
4. ✅ Ensure either `body_html` or `body_md` has content

### After importing:
1. ✅ Use `/api/send/personalize` to test with specific email addresses
2. ✅ Verify audience rules match expected users
3. ✅ Check that specificity hierarchy works as expected

---

## Troubleshooting

**Problem:** User gets wrong content

**Check:**
1. Does user have correct geo_metrics? Query `v_subscriber_geo`
2. Does user have correct OCD IDs? Query `profiles.ocd_ids`
3. Is there a higher-priority content item matching?
4. Check audience_rule syntax - invalid JSON silently fails

**Problem:** Everyone gets global content

**Check:**
1. Are `ocd_scope` values formatted correctly?
2. Do users have `ocd_ids` populated in their profiles?
3. Is `metadata.audience_rule` valid JSON?

**Problem:** Priority not working

**Check:**
1. Is priority stored as a number, not a string?
2. Remember: **lower number = higher priority**
3. Priority only matters when specificity is equal

---

## Quick Reference

| Feature | Column | Format | Example |
|---------|--------|--------|---------|
| Audience targeting | `metadata.audience_rule` | JSON object | `{"any":[{"level":"state","op":"eq","value":"OH"}]}` |
| Geographic scope | `ocd_scope` | Shorthand or OCD ID | `place:columbus,oh` or `state:oh` |
| Priority | `metadata.priority` | Integer | `1` (higher) vs `100` (lower) |
| HTML content | `body_html` | HTML string | `<p>Content</p>` |
| Markdown fallback | `body_md` | Markdown string | `# Heading` |

---

✅ **Questions?** Check the [Content Import Contract](../ingest/content-import-contract.md) or [API documentation](../review/PERSONALIZATION-API-SETUP.md)
