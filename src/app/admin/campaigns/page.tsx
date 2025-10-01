// file: src/app/admin/campaigns/page.tsx
// Purpose: Legacy redirect from /admin/campaigns to /admin/send
import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/admin/send')
}
