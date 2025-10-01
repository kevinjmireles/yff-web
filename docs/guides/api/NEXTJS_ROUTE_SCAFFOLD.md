# Next.js API Route Scaffold — `/app/api/v1/token/resolve`

> Keep it tiny, testable, and side-effect free.

## Route
```ts
// src/app/api/v1/token/resolve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublisherFromAuth } from "@/lib/publishers";
import { resolveDelegation } from "@/lib/token-resolution";
import { cacheGet, cacheSet } from "@/lib/cache";

const Body = z.object({
  token: z.string().min(1),
  recipient: z.object({
    email: z.string().email().optional(),
    external_id: z.string().optional(),
    zipcode: z.string().optional(),
    ocd_id: z.string().optional()
  }),
  publisher: z.object({ publisher_id: z.string() }),
  output: z.enum(["html", "text"]).default("html")
});

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const apiKey = auth.replace(/^Bearer\s+/i, "");
  const idem = req.headers.get("idempotency-key") ?? crypto.randomUUID();

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const pub = await getPublisherFromAuth(apiKey, parsed.publisher.publisher_id);
  if (!pub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const cacheKey = JSON.stringify({ p: pub.id, t: parsed.token, r: parsed.recipient, o: parsed.output });
  const cached = await cacheGet(cacheKey);
  if (cached) return NextResponse.json(cached, { headers: { "Cache-Control": "max-age=86400", "ETag": cached.etag } });

  try {
    const result = await resolveDelegation(parsed);
    const body = { resolved: result.rendered, meta: result.meta, etag: crypto.randomUUID() };
    await cacheSet(cacheKey, body, 86400);
    return NextResponse.json(body, { headers: { "Cache-Control": "max-age=86400", "ETag": body.etag, "Idempotency-Key": idem } });
  } catch (e) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Unexpected error" }, { status: 500 });
  }
}
```

## Library seam
```ts
// src/lib/token-resolution.ts
import { z } from "zod";

export const Options = z.object({
  format: z.enum(["compact","detailed"]).default("compact"),
  style: z.enum(["lines","bullets","inline"]).default("lines"),
  include_contacts: z.boolean().default(false),
  locale: z.string().default("en-US"),
  fallback: z.string().optional()
});

export async function resolveDelegation(input: {
  token: string;
  recipient: { email?: string; external_id?: string; zipcode?: string; ocd_id?: string; };
  output: "html" | "text";
}) {
  // 1) Parse token & options (allowlist keys only)
  const opts = Options.parse(parseOptions(input.token));

  // 2) Resolve geo (prefer ocd_id, else zipcode -> ocd_id)
  const ocdId = await resolveGeo(input.recipient);

  // 3) Load officials
  const delegation = await loadDelegation(ocdId);

  if (!delegation || delegation.length === 0) {
    if (opts.fallback) return { rendered: opts.fallback, meta: { token_type: "delegation", locale: opts.locale, data_age: null } };
    const error: any = new Error("No match for recipient or geo keys."); (error as any).code = "RECIPIENT_NOT_FOUND"; throw error;
  }

  // 4) Render
  const rendered = renderDelegation(delegation, opts, input.output);
  return { rendered, meta: { token_type: "delegation", locale: opts.locale, data_age: new Date().toISOString().slice(0,10) } };
}

// Helpers (stubs)
function parseOptions(token: string) { return { format: "compact", style: "lines", include_contacts: false, locale: "en-US" }; }
async function resolveGeo(_r: any) { return "ocd-division/country:us/state:ny/place:new_york"; }
async function loadDelegation(_ocdId: string) { return [{ role: "Senator", name: "Kirsten Gillibrand" }, { role: "Senator", name: "Chuck Schumer" }, { role: "Representative", name: "Dan Goldman" }]; }
function renderDelegation(list: any[], opts: any, output: "html"|"text") {
  if (output === "text") return list.map(x => (x.role === "Representative" ? `Rep. ${x.name}` : `Sen. ${x.name}`)).join("; ");
  if (opts.style === "bullets") return `<ul>${list.map(x => `<li>${x.role === "Representative" ? "Rep." : "Sen."} ${x.name}</li>`).join("")}</ul>`;
  return `<div>${list.map(x => (x.role === "Representative" ? `Rep. ${x.name}` : `Sen. ${x.name}`)).join(" • ")}</div>`;
}
```

## Vitest tests (unit)
```ts
// tests/token-resolution.test.ts
import { describe, it, expect } from "vitest";
import { resolveDelegation } from "@/lib/token-resolution";

describe("resolveDelegation", () => {
  it("returns compact html by default", async () => {
    const out = await resolveDelegation({ token: "{{fido.delegation}}", recipient: { zipcode: "11201" }, output: "html" });
    expect(out.rendered).toContain("Sen.");
    expect(out.meta.token_type).toBe("delegation");
  });

  it("returns text output when requested", async () => {
    const out = await resolveDelegation({ token: "{{fido.delegation}}", recipient: { zipcode: "11201" }, output: "text" });
    expect(out.rendered).toMatch(/Sen\./);
    expect(out.rendered).toMatch(/Rep\./);
  });

  it("uses fallback when no match", async () => {
    const out = await resolveDelegation({ token: "{{fido.delegation fallback=\"District info is updating\"}}", recipient: { zipcode: "00000" }, output: "text" });
    expect(out.rendered).toContain("District info is updating");
  });
});
```

## Integration tests (Next.js route)
```ts
// tests/api-resolve.test.ts
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/v1/token/resolve/route";
import { NextRequest } from "next/server";

function req(body: any, headers: Record<string,string> = {}) {
  return new NextRequest("http://localhost/api/v1/token/resolve", { method: "POST", body: JSON.stringify(body), headers });
}

describe("POST /api/v1/token/resolve", () => {
  it("200 on happy path", async () => {
    const res = await POST(req({
      token: "{{fido.delegation}}",
      recipient: { zipcode: "11201" },
      publisher: { publisher_id: "pub_1234" },
      output: "html"
    }, { authorization: "Bearer test_key" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.resolved).toContain("Sen.");
  });
});
```
