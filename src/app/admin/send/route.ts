export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const proxy = await fetch(new URL('/api/send/run', req.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return new Response(await proxy.text(), {
    status: proxy.status,
    headers: { 'content-type': 'application/json' },
  });
}
