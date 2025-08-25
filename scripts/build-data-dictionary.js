// scripts/build-data-dictionary.js
// Generates docs/exports/YFF_V2.1_Data_Dictionary.xlsx
// TOC mirrors docs/functional/table_inventory.csv
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const Excel = require("exceljs");

const INVENTORY = path.join("docs", "functional", "table_inventory.csv");
const OUTDIR = path.join("docs", "exports");
const OUTFILE = path.join(OUTDIR, "YFF_V2.1_Data_Dictionary.xlsx");

// Hardcoded schemas for V2.1 (update if schema changes)
const SCHEMAS = {
  profiles: [
    ["user_id", "uuid (PK)", "System", "No", "Internal user identifier; used by RLS owner checks and FKs."],
    ["email", "text (unique)", "System", "No (support-only)", "Primary identity + dedupe key for profile upserts."],
    ["address", "text", "System (via UI → server)", "Yes", "Subscriber-provided; server validates & stores canonicalized form."],
    ["zipcode", "text", "System", "No", "From Google Civic normalizedInput; supports UX & filtering."],
    ["ocd_ids", "text[]", "System", "No", "OCD division IDs from divisionsByAddress; personalization source."],
    ["ocd_last_verified_at", "timestamptz", "System", "No", "When OCD IDs were last refreshed."],
    ["created_at", "timestamptz", "System", "No", "Creation timestamp for audit."]
  ],
  subscriptions: [
    ["id", "uuid (PK)", "System", "No", "Row identifier."],
    ["user_id", "uuid (FK → profiles.user_id)", "System", "No", "Owner of the subscription row; unique with list_key."],
    ["list_key", "text", "System", "Indirectly", "Which list (e.g., 'general'). UI offers choices; server writes value."],
    ["unsubscribed_at", "timestamptz", "System (via UI → server)", "Yes", "Null=subscribed; timestamp=unsubscribed. Toggled by unsubscribe flow."],
    ["created_at", "timestamptz", "System", "No", "Creation timestamp for audit."]
  ],
  content_slices: [
    ["id", "uuid (PK)", "System", "No", "Row identifier."],
    ["article_key", "text", "Author", "No", "Groups slices into one article (e.g., 'funding-2025-08')."],
    ["section_order", "int", "Author", "No", "Vertical order within article."],
    ["is_headline", "boolean", "Author", "No", "Scoped headline override for matching recipients."],
    ["title", "text", "Author", "No", "Slice headline (optional)."],
    ["dek", "text", "Author", "No", "Subheading."],
    ["body_md", "text (Markdown)", "Author", "No", "Body content; Markdown allowed."],
    ["link_url", "text", "Author", "No", "Optional CTA / link."],
    ["scope_ocd_id", "text (nullable)", "Author", "No", "Canonical OCD ID this slice applies to; null=global."],
    ["tags", "text[]", "Author", "No", "Labels for filters/analytics."],
    ["publish_status", "text enum", "Author", "No", "draft | published | archived."],
    ["publish_at", "timestamptz", "Author", "No", "Visibility start."],
    ["expires_at", "timestamptz", "Author", "No", "Visibility end."],
    ["sort_index", "int", "Author", "No", "Tie-breaker within section/scope."],
    ["created_at", "timestamptz", "System", "No", "Audit."]
  ],
  delivery_history: [
    ["id", "uuid (PK)", "System", "No", "Row identifier."],
    ["email", "text", "System", "No", "Recipient email for this send attempt."],
    ["campaign_tag", "text", "System", "No", "Campaign label (e.g., 'funding-2025-08')."],
    ["send_batch_id", "text", "System", "No", "Idempotency token for a specific run; prevents duplicates."],
    ["provider_message_id", "text (nullable)", "System", "No", "Message ID from email provider; null if failed pre-provider."],
    ["sent_at", "timestamptz", "System", "No", "Timestamp when the send was initiated."]
  ],
  delivery_events: [
    ["id", "uuid (PK)", "System", "No", "Row identifier."],
    ["email", "text", "System", "No", "Recipient email associated with the event."],
    ["event_type", "text enum", "System", "No", "delivered | open | click | bounce | spamreport | unsubscribe."],
    ["provider_message_id", "text", "System", "No", "Provider message ID to correlate events to history."],
    ["event_at", "timestamptz", "System", "No", "Timestamp of the event."]
  ],
  campaign_runs: [
    ["id", "uuid (PK)", "System", "No", "Row identifier."],
    ["campaign_tag", "text", "System", "No", "Label of the send."],
    ["article_key", "text", "System", "No", "Article sent during the run."],
    ["actor", "text", "System", "No", "Admin identity who triggered the run."],
    ["send_batch_id", "text", "System", "No", "Idempotency token for the run."],
    ["started_at", "timestamptz", "System", "No", "When the run started."]
  ],
  dead_letters: [
    ["id", "uuid (PK)", "System", "No", "Row identifier."],
    ["topic", "text", "System", "No", "Area of failure (e.g., 'send')."],
    ["payload", "jsonb", "System", "No", "Original request/payload for investigation."],
    ["error", "text", "System", "No", "Error details / stack message."],
    ["created_at", "timestamptz", "System", "No", "When the failure was recorded."]
  ]
};

const HEADERS = ["Column", "Type", "Who writes", "Can subscriber change?", "Purpose / Notes"];
const safeSheetName = (name) => name.slice(0, 31);

(async function main() {
  let csv = fs.readFileSync(INVENTORY, "utf8");
  
  // Filter out comment lines (lines starting with #)
  const lines = csv.split('\n').filter(line => !line.trim().startsWith('#'));
  csv = lines.join('\n');
  
  const rows = parse(csv, { columns: true, skip_empty_lines: true });

  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  const wb = new Excel.Workbook();

  // TOC mirrors the CSV exactly
  const toc = wb.addWorksheet("TOC");
  const tocHeaders = Object.keys(rows[0] || { table: "", purpose: "", primary_key: "", unique_indexes: "", rls_posture: "", notes: "" });
  toc.addRow(tocHeaders);
  rows.forEach((r) => toc.addRow(tocHeaders.map((h) => r[h])));

  // One sheet per table from the CSV
  for (const r of rows) {
    const t = r.table.trim();
  	const ws = wb.addWorksheet(safeSheetName(t));
    ws.addRow(HEADERS);
    const schema = SCHEMAS[t];
    if (schema) {
      for (const line of schema) ws.addRow(line);
    } else {
      ws.addRow(["—", "—", "—", "—", "No schema yet; add as needed."]);
    }
    ws.columns.forEach((c) => { c.width = Math.max(18, (c.header || "").length + 2); });
  }

  await wb.xlsx.writeFile(OUTFILE);
  console.log("Wrote", OUTFILE);
})().catch((e) => { console.error(e); process.exit(1); });
