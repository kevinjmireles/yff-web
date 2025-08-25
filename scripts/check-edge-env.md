# Edge Function Environment Check

## Quick Check

```bash
supabase secrets list --project-ref $PROJECT_REF | sed -n '1,120p'
# Should include: SB_URL, SB_SERVICE_ROLE_KEY, CIVIC_API_KEY, UNSUB_SECRET (and any optional ones)
```

## Required Variables

- `SB_URL` - Supabase project URL
- `SB_SERVICE_ROLE_KEY` - Service role key

## Optional Variables

- `CIVIC_API_KEY` - Google Civic API key
- `UNSUB_SECRET` - HMAC validation secret
- `EDGE_SHARED_SECRET` - Proxy authentication
- `CORS_ORIGINS` - Allowed CORS origins

## Verification

After setting secrets, verify they're accessible:

```bash
# Test environment loading
supabase functions serve --env-file .env.edge
```

## Troubleshooting

If you see "Missing SB_URL or SB_SERVICE_ROLE_KEY":

1. Check that secrets are set with correct names
2. Verify project reference is correct
3. Ensure no typos in secret names
4. Check `.env.edge` file if using local development
