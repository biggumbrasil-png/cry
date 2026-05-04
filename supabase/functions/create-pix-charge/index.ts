// supabase/functions/create-pix-charge/index.ts
// Deploy: supabase functions deploy create-pix-charge --no-verify-jwt
// Required secrets: CASHINPAY_API_KEY
// Auto-injected:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const L = "[create-pix-charge]";
console.log(L, "[BOOT]", new Date().toISOString());

addEventListener("error",             (e) => console.error(L, "[FATAL]", e.message));
addEventListener("unhandledrejection", (e) => console.error(L, "[FATAL]", e.reason));

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};

const CASHINPAY_BASE = "https://api.cashinpaybr.com/api/v1";
const EXPIRES_MS     = 30 * 60 * 1000;
const MIN_AMOUNT     = 3;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonOk  = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ ok: true, ...data }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

const jsonErr = (error: string, status = 400) =>
  new Response(JSON.stringify({ ok: false, error }),
    { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  console.log(L, "[REQ]", req.method);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return jsonErr("Use POST", 405);

  try {
    // ── 1. Body ───────────────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return jsonErr("Body inválido — esperado JSON com { amount, userId }", 400); }

    // ── 2. Validação ──────────────────────────────────────────
    const raw    = body.amount;
    const amount = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    if (!isFinite(amount) || amount < MIN_AMOUNT) {
      return jsonErr(`Valor mínimo: R$ ${MIN_AMOUNT.toFixed(2).replace(".", ",")}`, 400);
    }
    const value  = parseFloat(amount.toFixed(2));

    // userId obrigatório para salvar em pix_payments e creditar via webhook
    const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    if (!userId) return jsonErr("userId obrigatório", 400);

    // ── 3. Secrets ────────────────────────────────────────────
    const apiKey     = (Deno.env.get("CASHINPAY_API_KEY")          ?? "").trim();
    const sbUrl      = (Deno.env.get("SUPABASE_URL")               ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "").trim();

    if (!apiKey) {
      console.error(L, "[CFG] CASHINPAY_API_KEY ausente");
      return jsonErr("Erro de configuração", 500);
    }
    console.log(L, "[CFG]", { keyPreview: apiKey.slice(0, 8) + "…" });

    // ── 4. Chamada CashinPay ──────────────────────────────────
    const reqBody = {
      amount:         value,
      payment_method: "pix",
      description:    "Depósito NexusYield",
      metadata:       { user_id: userId },
    };
    console.log(L, "[CASHINPAY REQ]", { amount: value, userId: userId.slice(0, 8) + "…" });

    let cpRes: Response;
    try {
      cpRes = await fetch(`${CASHINPAY_BASE}/transactions`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(reqBody),
      });
    } catch (e) {
      console.error(L, "[NET]", (e as Error).message);
      return jsonErr(`Falha de rede ao criar cobrança`, 502);
    }

    // ── 5. Parse da resposta ──────────────────────────────────
    const rawText = await cpRes.text();
    console.log(L, "[CASHINPAY RES]", cpRes.status, rawText.slice(0, 600));

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(rawText); }
    catch { return jsonErr(`CashinPay ${cpRes.status}: resposta não-JSON`, 502); }

    if (!cpRes.ok) {
      const msg = (data.message ?? data.error ?? `status ${cpRes.status}`) as string;
      console.error(L, "[CASHINPAY ERR]", cpRes.status, msg);
      return jsonErr(`Erro ao criar cobrança PIX: ${msg}`, 502);
    }

    // ── 6. Extrai campos do QR Code ───────────────────────────
    // CashinPay pode aninhar os dados em diferentes níveis — logamos acima para ajustar.
    const pixObj = (data.pix ?? data.payment ?? data) as Record<string, unknown>;

    const payload = (
      pixObj.qr_code          ??
      pixObj.pix_copia_e_cola ??
      pixObj.payload          ??
      pixObj.emv              ??
      data.qr_code            ??
      ""
    ) as string;

    const encodedImage = (
      pixObj.qr_code_image ??
      pixObj.encoded_image ??
      pixObj.qrcode_image  ??
      data.qr_code_image   ??
      ""
    ) as string;

    const expiresAt = (
      pixObj.expiration      ??
      pixObj.expires_at      ??
      pixObj.expiration_date ??
      data.expires_at        ??
      new Date(Date.now() + EXPIRES_MS).toISOString()
    ) as string;

    // ID da transação na CashinPay — necessário para o webhook localizar este PIX
    const gatewayTxnId = (
      data.id                                                          ??
      (data.data        as Record<string, unknown> | undefined)?.id   ??
      (data.transaction as Record<string, unknown> | undefined)?.id   ??
      null
    ) as string | null;

    if (!payload)      console.warn(L, "[WARN] payload vazio — verifique campos da resposta acima");
    if (!encodedImage) console.warn(L, "[WARN] encodedImage vazio — QR decorativo será usado");
    if (!gatewayTxnId) console.warn(L, "[WARN] gatewayTxnId não encontrado — webhook não conseguirá creditar automaticamente");

    // ── 7. Salva em pix_payments ──────────────────────────────
    // Não bloqueante: falha aqui não impede retorno do QR ao usuário,
    // mas sem este registro o webhook não consegue creditar o saldo.
    if (sbUrl && serviceKey) {
      const pixRecord = {
        user_id:               userId,
        amount:                value,
        status:                "pending",
        gateway:               "cashinpay",
        gateway_transaction_id: gatewayTxnId,
        pix_qr_code:           payload      || null,
        pix_qr_code_url:       encodedImage || null,
        expires_at:            expiresAt    || null,
        created_at:            new Date().toISOString(),
        updated_at:            new Date().toISOString(),
      };

      fetch(`${sbUrl}/rest/v1/pix_payments`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify(pixRecord),
      }).then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          console.error(L, "[DB] falha ao salvar pix_payments:", r.status, t.slice(0, 300));
        } else {
          console.log(L, "[DB] pix_payment salvo:", gatewayTxnId ? gatewayTxnId.slice(0, 12) + "…" : "sem id");
        }
      }).catch((e: Error) => {
        console.error(L, "[DB] erro ao salvar pix_payments:", e.message);
      });
    } else {
      console.warn(L, "[DB] SUPABASE secrets ausentes — pix_payment não salvo");
    }

    // ── 8. Resposta ao frontend ───────────────────────────────
    return jsonOk({ payload, encodedImage, expiresAt, amount: value });

  } catch (e) {
    console.error(L, "[HANDLER_FATAL]", (e as Error).message);
    return jsonErr("Erro interno ao processar requisição", 500);
  }
});
