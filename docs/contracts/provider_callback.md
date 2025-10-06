# Provider Callback Contract

Endpoint: `POST /api/provider/callback`

Headers:
- `Content-Type: application/json`

Body shape:
```json
{
  "job_id": "uuid",
  "batch_id": "uuid",
  "results": [
    {
      "email": "user@example.com",
      "status": "delivered",
      "provider_message_id": "SG.xxxxx",
      "error": null
    }
  ]
}
```

Rules:
- Idempotent: duplicate callbacks with the same `provider_message_id` (or same triple `{job_id,batch_id,email,status}` when no message id) are recorded once.
- `delivery_history` is updated where `(job_id, batch_id, email)` matches.
- Allowed statuses: `delivered`, `failed`.
