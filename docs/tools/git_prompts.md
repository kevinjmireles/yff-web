You are my pair engineer. Run a pre-release validation for the next milestone and only commit/tag if all checks pass or after I confirm fixes.

# === CONFIG (edit these two lines only) ===
TAG_NAME="v0.2.0-make-import"
TAG_MESSAGE="CSV import via Make.com into audience_members; dedupe with (email,campaign_tag)"
# ==========================================

# 1) FILESYSTEM CHECKS (non-destructive)
# 1a. Required docs exist
assert file_exists("./docs/functional/data_dictionary.md"), "Missing data_dictionary.md"
assert file_exists("./docs/functional/table_inventory.csv"), "Missing table_inventory.csv"
assert file_exists("./docs/CONTRIBUTING.md"), "Missing CONTRIBUTING.md"

# 1b. Migrations folder exists
assert dir_exists("./supabase/migrations"), "Missing /supabase/migrations directory (required)"

# 1c. Detect uncommitted changes
$GIT_STATUS = sh("git status --porcelain")

# 2) DATA DICTIONARY VALIDATIONS
$DD = read_file("./docs/functional/data_dictionary.md")

# 2a. Must contain these sections (simple presence check)
for section in ["## audience_members", "## delivery_history", "## delivery_events"]:
  assert section in $DD, f"Missing section in data_dictionary.md: {section}"

# 2b. RLS line MUST match EXACTLY
$RLS_LINE_REQUIRED = "RLS enabled on: audience_members, delivery_events. Writes via service-role keys only. No anon read/write policies configured."
has_required_line = $RLS_LINE_REQUIRED in $DD

# Try to auto-fix if close variants exist (collapse duplicates, enforce exact sentence)
if not has_required_line:
  # Normalize whitespace and dashes
  $DD_fixed = $DD
  # Remove any existing lines that start with "RLS enabled on:" to avoid duplicates
  $DD_fixed = regex_sub($DD_fixed, r"## Security / RLS overview[\\s\\S]*?(?=(\\n## |\\Z))", "## Security / RLS overview\n" + $RLS_LINE_REQUIRED + "\n\n### Notes (for maintainers)\n", flags="m")
  write_file("./docs/functional/data_dictionary.md", $DD_fixed)
  $DD = read_file("./docs/functional/data_dictionary.md")
  has_required_line = $RLS_LINE_REQUIRED in $DD

assert has_required_line, "RLS overview line missing or not exact in data_dictionary.md"

# 2c. Dictionary links to table inventory
assert "[Table Inventory](./table_inventory.csv)" in $DD, "Missing link to table_inventory.csv in data_dictionary.md header"

# 3) TABLE INVENTORY VALIDATIONS (CSV HEADERS + KEY ROWS)
$TI = read_file("./docs/functional/table_inventory.csv")
# header must match exactly:
assert $TI.splitlines()[0].strip() == "table_name,columns_in_db,rows_estimated,in_data_dictionary,used_in_mvp,notes", "table_inventory.csv header mismatch"

# ensure at least these rows exist (name-only check to avoid strict counts):
for t in ["audience_members","delivery_events","delivery_history","subscribers","officials","official_contacts","provider_events","content_items","content_blocks","content_datasets"]:
  assert t in $TI, f"table_inventory.csv missing row for: {t}"

# 4) CONTRIBUTING VALIDATIONS
$CONTRIB = read_file("./docs/CONTRIBUTING.md")
assert "## Database Docs Policy" in $CONTRIB, "CONTRIBUTING.md missing 'Database Docs Policy' section"
assert "## Milestone Tagging" in $CONTRIB, "CONTRIBUTING.md missing 'Milestone Tagging' section"
assert "## Milestone Release Checklist" in $CONTRIB, "CONTRIBUTING.md missing 'Milestone Release Checklist' section"

# 5) REPORT (no side effects yet)
print("=== Pre-Release Validation Report ===")
print("Uncommitted changes present:" if $GIT_STATUS.strip() else "No working changes detected.")
print("- data_dictionary.md: OK")
print("- table_inventory.csv: OK")
print("- CONTRIBUTING.md: OK")
print("- Migrations folder present: OK")
print(f"- Tag to create: {TAG_NAME}  ::  {TAG_MESSAGE}")

# 6) PAUSE FOR CONFIRMATION
print("\nIf the report looks good, reply exactly with: CONFIRM COMMIT")
halt()

# 7) ON CONFIRMATION: STAGE, COMMIT, TAG, PUSH
# (Cursor will resume here when I reply "CONFIRM COMMIT")

sh("git add .")
# If nothing staged, this will no-op safely
$STAGED = sh("git diff --cached --name-only")
print("Staged files:\n" + ($STAGED if $STAGED.strip() else "(none)"))

# Create commit if there are staged changes
if $STAGED.strip():
  sh('git commit -m "docs+db: milestone ' + TAG_NAME + ' (auto-validated docs + structure)"')
else:
  print("No staged changes; skipping commit.")

# Create annotated tag (idempotent check; if tag exists, skip)
$TAGS = sh("git tag --list")
if TAG_NAME in $TAGS:
  print("Tag already exists; skipping tag creation.")
else:
  sh('git tag -a ' + TAG_NAME + ' -m "' + TAG_MESSAGE + '"')

# Push commit and tag
sh("git push")
sh("git push --tags")

# Final confirmation
print("\n=== Final Git Log (last 5) ===")
print(sh("git log --oneline -5"))

print("\nDone. Milestone tagged.")
