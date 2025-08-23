// Purpose: Minimal admin gate helpers. Extend later if needed.
// Called by: /app/admin/* routes, server components.

export function isAdminEmail(email?: string | null) {
  // Smallest placeholder. Replace with a real rule or RLS-backed check later.
  const allowList = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  return !!email && allowList.includes(email.toLowerCase())
}
