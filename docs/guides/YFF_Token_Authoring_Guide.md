# YFF — Token Authoring Guide (MVP)

There are **two kinds of tokens**:

1. **Template Tokens (SendGrid)** — Handlebars placeholders in the SendGrid Dynamic Template, e.g. `{{first_name}}`, `{{unsubscribe_url}}`, `{{{body_html}}}`.
2. **Content Tokens (Markdown/Article)** — Double-bracket tokens inside your article Markdown (CSV `body_md`), e.g. `[[ZIP.hazard_flag]]`. Fido resolves these **before** sending to SendGrid.

## Where to put tokens

- Put **layout/branding** tokens in SendGrid (header/footer, `{{first_name}}`, `{{unsubscribe_url}}`, `{{{body_html}}}`).
- Put **story-specific personalization** inside your article Markdown using `[[...]]` tokens.

Fido will render `body_md` to HTML and resolve any `[[...]]` tokens, then pass the final HTML to SendGrid as `body_html`.

## Supported Content Tokens (MVP)

| Token | Description | Example Output |
|------|-------------|----------------|
| `[[ZIP.hazard_flag]]` | Hazard level looked up by subscriber ZIP (from your uploaded tagged list) | `High` |
| `[[ZIP.hazard_notes]]` | Human-readable notes for the ZIP | `High hazard due to multiple toxic waste dumps` |
| `[[DELEGATION]]` | Inserts Rep + two Senators based on the subscriber’s OCD IDs | `Sen. Padilla; Sen. Butler; Rep. Sánchez` |
| `[[FIRST_NAME]]` *(optional)* | Subscriber first name, if available | `Maria` |

> If `FIRST_NAME` is not collected, leave it out. The SendGrid template defaults the greeting to “Hello,”.

## Authoring Example (Markdown)

```md
## Are you in a high hazard area?

Local hazard status: **[[ZIP.hazard_flag]]**  
Details: [[ZIP.hazard_notes]]

Representatives you can contact:  
[[DELEGATION]]
```

This renders to HTML and is injected into the `{{{body_html}}}` slot in SendGrid.

## SendGrid Template Variables (provided by Fido)

- `{{first_name}}` *(may be empty)*
- `{{preheader}}`
- `{{{body_html}}}` *(HTML from your article)*
- `{{cta_url}}` / `{{cta_label}}` *(optional)*
- `{{unsubscribe_url}}`
- `{{postal_address}}` *(optional)*

**Subject line** is set in SendGrid; you can use tokens there too.

## Rules of thumb

- Don’t put SendGrid `{{ }}` tokens inside Markdown; use `[[ ]]` there.  
- Keep template structure light (header, footer, one `{{{body_html}}}` slot).  
- Avoid heavy conditionals in SendGrid for MVP; let Fido choose content via `scope_ocd_id`.
