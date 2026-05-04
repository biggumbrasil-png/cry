// supabase/functions/cashinpay-webhook/index.ts
// Deploy: supabase functions deploy cashinpay-webhook --no-verify-jwt
// Required secrets: CASHINPAY_WEBHOOK_SECRET
// Auto-injected:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const L = "[cashinpay-webhook]";
console.log(L, "[BOOT]", new Date().toISOString());

addEventListener("error",             (e) => console.error(L, "[FATAL]", e.message));
addEventListener("unhandledrejection", (e) => console.error(L, "[FATAL]", e.reason));

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAID_EVENTS     = new Set(["transaction.paid", "paid"]);
const TERMINAL_EVENTS = new Set(["transaction.expired", "expired",
                                  "transaction.cancelled", "cancelled"]);

// ── Response helpers ──────────────────────────────────────────────────────────

const respond = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body),
    { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Client-facing messages are generic — details stay in logs only
const ok  = (msg: string)                   => respond({ received: true,  msg    }, 200);
const err = (msg: string, status: number)   => respond({ received: false, error: msg }, status);

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    if (isNaN(b)) return null;
    out[i / 2] = b;
  }
  return out;
}

async function verifySignature(
  secret:  string,
  rawBody: string,
  header:  string,
): Promise<boolean> {
  const hex      = header.replace(/^sha256=/, "").trim();
  const sigBytes = hexToBytes(hex);
  if (!sigBytes || sigBytes.length === 0) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
}

// ── Supabase RPC helper ───────────────────────────────────────────────────────

async function callRpc(
  sbUrl:      string,
  serviceKey: string,
  fn:         string,
  params:     Record<string, unknown>,
): Promise<unknown> {
  const res  = await fetch(`${sbUrl}/rest/v1/rpc/${fn}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RPC ${fn} ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); }
  catch { return text; }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  console.log(L, "[REQ]", req.method);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return err("Método não permitido", 405);

  // ── 1. Secrets ────────────────────────────────────────────────────────────
  const webhookSecret = (Deno.env.get("CASHINPAY_WEBHOOK_SECRET")  ?? "").trim();
  const sbUrl         = (Deno.env.get("SUPABASE_URL")              ?? "").trim();
  const serviceKey    = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

  if (!webhookSecret || !sbUrl || !serviceKey) {
    const missing = [
      !webhookSecret && "CASHINPAY_WEBHOOK_SECRET",
      !sbUrl         && "SUPABASE_URL",
      !serviceKey    && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean).join(", ");
    console.error(L, "[CFG] secrets ausentes:", missing);
    return err("Erro de configuração", 500);
  }

  // ── 2. Raw body — must be read before JSON.parse for HMAC ─────────────────
  let rawBody: string;
  try { rawBody = await req.text(); }
  catch { return err("Falha ao ler requisição", 400); }
  if (!rawBody) return err("Body vazio", 400);

  // ── 3. HMAC validation ────────────────────────────────────────────────────
  const sigHeader = (req.headers.get("x-cashinpay-signature") ?? "").trim();
  if (!sigHeader) {
    console.warn(L, "[SIG] header x-cashinpay-signature ausente");
    return err("Assinatura ausente", 401);
  }

  let sigValid: boolean;
  try { sigValid = await verifySignature(webhookSecret, rawBody, sigHeader); }
  catch (e) {
    console.error(L, "[SIG] erro na verificação:", (e as Error).message);
    return err("Falha na verificação de assinatura", 500);
  }

  if (!sigValid) {
    console.error(L, "[SIG] inválida — prefix:", sigHeader.slice(0, 10) + "…");
    return err("Assinatura inválida", 401);
  }
  console.log(L, "[SIG] ok");

  // ── 4. Parse JSON ─────────────────────────────────────────────────────────
  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); }
  catch { return err("Payload não é JSON válido", 400); }

  // ── 5. Event type ─────────────────────────────────────────────────────────
  const eventType = (
    (typeof event.event  === "string" ? event.event  : null) ??
    (typeof event.type   === "string" ? event.type   : null) ??
    (typeof event.status === "string" ? event.status : null) ??
    ""
  ).toLowerCase();

  console.log(L, "[EVENT]", eventType);

  if (TERMINAL_EVENTS.has(eventType)) {
    console.log(L, "[SKIP] evento terminal, nenhuma ação necessária:", eventType);
    return ok("evento ignorado");
  }
  if (!PAID_EVENTS.has(eventType)) {
    console.log(L, "[SKIP] evento desconhecido:", eventType);
    return ok("evento desconhecido ignorado");
  }

  // ── 6. Extract only gateway identifiers from payload ─────────────────────
  // user_id e amount são lidos do banco via RPC — não confiamos no payload para isso.
  const txn = (
    (event.transaction && typeof event.transaction === "object" ? event.transaction : null) ??
    (event.data        && typeof event.data        === "object" ? event.data        : null) ??
    event
  ) as Record<string, unknown>;

  const gatewayTxnId = (
    (typeof txn.id             === "string" ? txn.id             : null) ??
    (typeof txn.transaction_id === "string" ? txn.transaction_id : null) ??
    null
  );

  const gatewayEventId = (
    (typeof event.id       === "string" ? event.id       : null) ??
    (typeof event.event_id === "string" ? event.event_id : null) ??
    null
  );

  if (!gatewayTxnId) {
    console.error(L, "[VAL] gateway_transaction_id ausente no payload");
    return err("transaction id ausente", 422);
  }

  console.log(L, "[IDS]", {
    gatewayTxnId:   gatewayTxnId.slice(0, 12)               + "…",
    gatewayEventId: gatewayEventId ? gatewayEventId.slice(0, 12) + "…" : null,
  });

  // ── 7. Atomic processing via RPC ──────────────────────────────────────────
  // process_cashinpay_deposit:
  //   - localiza pix_payments por (gateway='cashinpay', gateway_transaction_id) com FOR UPDATE
  //   - se status='paid' → 'already_processed'
  //   - atualiza pix_payments, users.balance, insere em transactions — tudo em uma TX SQL
  //   - retorna: 'credited' | 'already_processed' | 'not_found'
  let result: unknown;
  try {
    result = await callRpc(sbUrl, serviceKey, "process_cashinpay_deposit", {
      p_gateway_txn_id:   gatewayTxnId,
      p_gateway_event_id: gatewayEventId,
    });
  } catch (e) {
    console.error(L, "[RPC]", (e as Error).message);
    return err("Erro ao processar depósito", 500);
  }

  console.log(L, "[RPC] resultado:", result);

  switch (result) {
    case "credited":          return ok("depósito creditado");
    case "already_processed": return ok("já processado");
    case "not_found":
      console.error(L, "[RPC] pix_payment não encontrado para txnId:", gatewayTxnId.slice(0, 12) + "…");
      return err("Cobrança não encontrada", 404);
    default:
      console.error(L, "[RPC] resultado inesperado:", result);
      return err("Resultado inesperado do RPC", 500);
  }
});
