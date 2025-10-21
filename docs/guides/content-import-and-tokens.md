Perfect — here’s your **Markdown User Guide** for the current MVP functionality (ready to drop into `docs/guides/content-import-and-tokens.md` or show in-app as help text).
It covers everything that exists today, cleanly structured for both end users and developers.

---

````markdown
# 📨 Your Friend Fido – Content Import & Token User Guide (MVP)

_Last updated: October 2025_

---

## Overview

This guide explains how to upload content, manage datasets, and use tokens in **Your Friend Fido (YFF)**.  
The current MVP supports importing HTML articles via CSV and inserting dynamic civic data (e.g., federal delegation) into emails.

---

## 1. Content Import Screen

The **Content Import** tool allows you to upload one CSV file per dataset.

### **Steps**

1. **Download the CSV template**
   - Use the “Download CSV Template” link at the top of the import screen.
   - Open in Excel, Google Sheets, or Numbers.

2. **Fill out the CSV**
   - Each row = one article or content item.
   - Save as `.csv` (UTF-8).

3. **Enter a Dataset Name**
   - Example: `October 2025 – Civic Updates`.
   - This name groups related items together for sending and testing.

4. **Select Replace Mode**
   - See options below.

5. **Upload your CSV**
   - Drag and drop or select the file.

6. **(Optional)** Enter a test email.
   - Use the “Send test to me” button to preview formatting.

---

## 2. Replace Modes

| Mode | Description | When to Use |
|------|--------------|-------------|
| **Surgical (only rows present in CSV)** | Updates or inserts all rows from the CSV, and deletes rows **not present** in the CSV. | Keep a dataset exactly in sync with your CSV (curated, monthly content). |
| **Nuclear (delete all rows in dataset then load)** | Deletes all rows in the dataset before importing new ones. | Starting from scratch (full refresh). |
| **None (pure upsert)** | Adds or updates rows, but does **not** delete anything. | Ongoing datasets that you append to over time. |

---

## 3. CSV Fields (Column Reference)

| Column | Required | Description | Example |
|---------|-----------|-------------|----------|
| **external_id** | ✅ Yes | Unique ID for each item within the dataset. Used for updates and deduplication. | `oct25-001` |
| **title** | ✅ Yes | The article title. | `Community Garden Opens Saturday` |
| **html** | ✅ Yes | The ready-to-render HTML body. *Only HTML supported at this time.* | `<p>Join us for...</p>` |
| **geo_level** | Optional | Targeting granularity (`city`, `county`, `state`, `zip`, `district`, etc.). | `state` |
| **geo_code** | Required if `geo_level` set | Specific code or name matching the level. | `ID` or `Ada County` |
| **topic** | Optional | Category tag for grouping. | `community` |
| **start_date** | Optional | Date this content becomes active (`YYYY-MM-DD`). | `2025-10-01` |
| **end_date** | Optional | Expiration date (`YYYY-MM-DD`). | `2025-10-31` |
| **priority** | Optional | Integer sorting hint (higher = more important). | `1` or `3` |
| **source_url** | Optional | Canonical link for attribution or “Read more.” | `https://example.com/article` |

---

## 4. HTML Formatting Rules

YFF accepts **HTML only** — no Markdown conversion.

### ✅ Allowed tags
`<p>`, `<a>`, `<strong>`, `<em>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<li>`, `<br>`, `<img>`

### ❌ Avoid
`<script>`, `<style>`, external CSS, embedded videos, or iframes.

### Example
```html
<h2>Community Garden Opens</h2>
<p>Join us on <strong>Saturday, Oct 15</strong> at 10 AM.</p>
<ul>
  <li>Ribbon cutting</li>
  <li>Volunteer sign-up</li>
</ul>
<p><a href="https://example.com/garden">Read more</a></p>
````

### Tools for authoring clean HTML

* [TinyMCE Online Demo](https://www.tiny.cloud/docs/tinymce/6/basic-example/)
* [CKEditor Demo](https://ckeditor.com/ckeditor-5/demo/)
* [Visual Studio Code](https://code.visualstudio.com/) + “Live Preview” extension

---

## 5. Testing Your Upload

Before you send to subscribers:

1. Enter your own email in the **“Test email”** field.
2. Click **Send test to me.**
3. Review the message layout and link behavior.

---

## 6. Tokens (Dynamic Content)

Tokens let you personalize content for each subscriber.
They are simple placeholders inside the HTML, wrapped in double brackets:

```
[[TOKEN_NAME]]
```

### Supported tokens (MVP)

| Token            | Description                                                | Source                                                |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `[[DELEGATION]]` | Inserts the subscriber’s U.S. Senators and Representative. | `officials` + `official_contacts` tables in Supabase. |

Example usage in HTML:

```html
<p>Your current congressional delegation:</p>
[[DELEGATION]]
```

When sent, this might render as:

```html
<p>Your current congressional delegation:</p>
<ul>
  <li>Senator Jane Doe (D-ID) – jane_doe@senate.gov</li>
  <li>Senator John Roe (R-ID) – john_roe@senate.gov</li>
  <li>Rep. Alex Smith (R-ID-01) – alex_smith@house.gov</li>
</ul>
```

---

## 7. How Token Data Works

* Tokens are **resolved automatically** when the email is sent.
* The `[[DELEGATION]]` token pulls directly from your existing Supabase tables:

  * `officials`
  * `official_contacts`
* No extra upload required for MVP.
* Future tokens (e.g., events, metrics, reusable snippets) will use the same pattern but can come from CSV datasets or JSON uploads.

---

## 8. Common Workflows

### **A. Uploading a Monthly Newsletter**

1. Fill CSV with new articles.
2. Use “Surgical” mode to match CSV exactly.
3. Add `[[DELEGATION]]` token where appropriate.
4. Send test email → verify output.
5. Approve send job in Make.com or `/api/send/execute`.

### **B. Updating Existing Items**

1. Update titles or HTML in the same CSV.
2. Keep `external_id` values unchanged.
3. Upload again with “Surgical” or “None” mode.
4. Old records are updated in place.

### **C. Incrementally Adding New Content**

1. Add new rows with new `external_id`s.
2. Upload with “None” mode to append without deletions.

---

## 9. Known Limitations (MVP)

* Only one token supported: `[[DELEGATION]]`
* No Markdown or WYSIWYG editor yet
* No UI for managing “snippets” or token datasets
* Geographic targeting limited to simple `geo_level`/`geo_code`
* Token preview currently limited to email test

---

## 10. Coming Soon (Post-MVP)

| Feature                                        | Description                                          |
| ---------------------------------------------- | ---------------------------------------------------- |
| **Snippet tokens (`[[SNIPPET:slug]]`)**        | Reusable HTML fragments (banners, disclaimers, etc.) |
| **List-by-Geo tokens (`[[LIST_BY_GEO:key]]`)** | Local data lists or metrics by ZIP, county, or state |
| **Token management UI**                        | Upload, edit, and preview tokens from the dashboard  |
| **Token linting**                              | Automatic validation of tokens at import time        |
| **HTML editor integration**                    | Inline editing and preview before send               |

---

## 11. Support Contacts (for internal use)

| Topic                  | Contact / Responsibility |
| ---------------------- | ------------------------ |
| Supabase schema issues | DevOps / Database admin  |
| SendGrid delivery      | Email infrastructure     |
| Token resolver logic   | Application developer    |
| CSV import bugs        | Front-end / API team     |

---

*This document describes the current MVP implementation and roadmap for token-based personalization. Future releases will expand token support and provide full UI management for reusable and geographic data.*

```
---

W