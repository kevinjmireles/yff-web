# Edge Functions Documentation

## Overview

This directory contains Supabase Edge Functions for Your Friend Fido. These functions handle subscriber management, profile updates, and unsubscribe operations.

## Environment Variables

**Required:**
- `SB_URL` (was `SUPABASE_URL`) - Supabase project URL
- `SB_SERVICE_ROLE_KEY` (was `SUPABASE_SERVICE_ROLE_KEY`) - Service role key for database access

**Optional:**
- `CIVIC_API_KEY` - Google Civic Information API key for address enrichment
- `UNSUB_SECRET` - Secret for HMAC unsubscribe token validation
- `EDGE_SHARED_SECRET` - Optional secret for proxy authentication
- `CORS_ORIGINS` - Comma-separated list of allowed CORS origins

**Note:** Supabase reserves the `SUPABASE_*` prefix for secrets; use `SB_URL` and `SB_SERVICE_ROLE_KEY`.

## Functions

### 1. profile-address

**Purpose:** Updates user profile with address and ensures subscription exists.

**Endpoint:** `POST /profile-address`

**Request Body:**
```json
{
  "email": "user@example.com",
  "address": "123 Main St, City, State 12345"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "zipcode": "12345",
    "ocd_ids": ["ocd-division/country:us/state:oh"]
  }
}
```

**Features:**
- Address validation via Google Civic API
- OCD ID extraction for political district targeting
- Profile upsert with conflict resolution
- Automatic subscription creation

### 2. subscriptions-toggle

**Purpose:** Toggles subscription status (subscribed/unsubscribed).

**Endpoint:** `POST /subscriptions-toggle`

**Request Body:**
```json
{
  "email": "user@example.com",
  "list_key": "general"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "list_key": "general",
    "status": "subscribed"
  }
}
```

**Features:**
- Deterministic toggle behavior
- Profile creation if missing
- Subscription creation if missing
- Idempotent operations

### 3. unsubscribe

**Purpose:** Handles unsubscribe requests with HMAC token validation.

**Endpoint:** `POST /unsubscribe`

**Request Body:**
```json
{
  "token": "hmac-generated-token",
  "email": "user@example.com",
  "list_key": "general"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "status": "unsubscribed"
  }
}
```

**Features:**
- HMAC token validation for security
- Idempotent unsubscribe (repeat calls return "noop")
- Rate limiting on repeated attempts
- Comprehensive error handling

## Security Features

- **Rate Limiting:** Database-backed rate limiting via `rate_limit_hits` table (by IP address)
- **CORS Protection:** Configurable origin restrictions
- **HMAC Validation:** Secure unsubscribe token validation using `payloadB64.hmacB64` format
- **RLS Compliance:** All database operations use service role
- **Error Schema:** Standardized error responses
- **Input Validation:** Email format, address length, and list_key validation

## Error Responses

All functions return consistent error responses:

```json
{
  "ok": false,
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": "Optional additional information"
}
```

**Common Error Codes:**
- `RATE_LIMITED` - Too many requests (429)
- `UNAUTHORIZED` - Invalid token or credentials (401)
- `INVALID_REQUEST` - Missing or invalid parameters (400)
- `DATABASE_ERROR` - Database operation failed (500)
- `INTERNAL_ERROR` - Unexpected server error (500)

## Deployment

Deploy functions using the Supabase CLI:

```bash
supabase functions deploy profile-address --project-ref YOUR_PROJECT_REF
supabase functions deploy subscriptions-toggle --project-ref YOUR_PROJECT_REF
supabase functions deploy unsubscribe --project-ref YOUR_PROJECT_REF
```

## Testing

Test functions with curl:

```bash
# Profile address update
curl -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/profile-address" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","address":"123 Main St, City, ST 12345"}'

# Subscription toggle
curl -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/subscriptions-toggle" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","list_key":"general"}'

# Unsubscribe
curl -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/unsubscribe" \
  -H "Content-Type: application/json" \
  -d '{"token":"valid-hmac-token","email":"test@example.com"}'
```

## Dependencies

- `@supabase/supabase-js` v2 - Supabase client library
- Deno standard library - Runtime environment
- Google Civic Information API - Address enrichment (optional)

## Database Schema Requirements

**Rate Limiting Table (`rate_limit_hits`):**
```sql
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_hits_ip_endpoint ON rate_limit_hits(ip_address, endpoint);
CREATE INDEX idx_rate_limit_hits_created_at ON rate_limit_hits(created_at);
```

**Note:** This table must exist for rate limiting to work. The Edge functions will create it automatically if it doesn't exist.
