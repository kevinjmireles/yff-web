# Add Localized Civic Personalization to Your Newsletter (Beehiiv/Mailchimp/Substack)

Give readers their **own** congressional delegation (or other geo content) inside your email — no extra data wrangling.

## What it looks like
**In your editor template:**
```
Hello {{subscriber.first_name}},

{{fido.delegation format="compact" style="lines"}}
```

**What readers see:**
```
Hello Sam,

Sen. Chuck Schumer • Sen. Kirsten Gillibrand • Rep. Dan Goldman
```

## How it works
1. You add the `{{fido.delegation}}` token where you want the block to appear.
2. Your ESP calls Fido at send-time with recipient info (email or ZIP).
3. Fido returns the correct snippet; your ESP sends the personalized email.

## Token Options (keep it simple)
- `format`: `compact` or `detailed`
- `style`: `lines`, `bullets`, or `inline`
- `include_contacts`: `true|false` (adds phone/email lines)
- `fallback`: text shown if no match

Example with contacts (HTML bullets):
```
{{fido.delegation format="detailed" style="bullets" include_contacts=true}}
```

## Integration (for your ESP team)
- Endpoint: `POST /v1/token/resolve` (Bearer auth)
- Docs: see the OpenAPI YAML included with this pack
- Rate limits and caching included; data stays fresh

## Privacy
- We only need **email+ZIP** or **OCD ID** for geo lookup.
- Hash-only mode available on request.

Want to pilot? Contact: partnerships@fido.dev
