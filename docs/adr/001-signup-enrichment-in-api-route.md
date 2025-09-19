# 1. Signup Enrichment Logic Moved to API Route

- **Status**: Accepted
- **Date**: 2025-09-19

## Context and Problem Statement

The original V2.1 architecture for user signup involved a multi-step process: a Next.js API route would receive the user's data and then make a second network call to a dedicated Supabase Edge Function (`/profile-address`). This Edge Function was solely responsible for calling the external Google Civic API to fetch OCD IDs and writing them to the database.

While this approach offered good separation of concerns, it introduced extra network latency, increased architectural complexity, and made local development and debugging more difficult, as evidenced by the challenges faced in diagnosing the OCD ID persistence issue.

## Decision

We have made the decision to consolidate the entire signup logic into the Next.js API route at `/api/signup`.

The new, simplified flow is as follows:
1. The Next.js frontend submits user data to `/api/signup`.
2. The API route validates the data (including reCAPTCHA).
3. The API route **directly** calls the Google Civic API.
4. The API route uses the Supabase Admin client to **directly** `upsert` the profile and subscription data into the database.

The API route is now required to run in the Node.js runtime (`export const runtime = 'nodejs'`) to support the Supabase Admin client.

## Consequences

### Positive

- **Reduced Complexity**: The architecture is now simpler and easier to understand, with one less component to manage and deploy.
- **Improved Performance**: Removing the extra network hop to the Edge Function reduces the overall latency of the signup process.
- **Simplified Development**: All backend logic for the signup flow is co-located, making it much easier to develop, test, and debug locally.
- **Enhanced Observability**: End-to-end logging for a single request is now contained within one service, simplifying troubleshooting.

### Negative

- **Tighter Coupling**: The Next.js API route is now more tightly coupled to the Google Civic API. However, since its primary purpose is this integration, this is an acceptable trade-off.
- **Deprecation**: The `/profile-address` Supabase Edge Function is now deprecated for the signup flow and is considered legacy code. It will be removed in a future cleanup.
