// ══════════════════════════════════════════════════════════════
// NEXUSYIELD — Edge Function: create-pix-charge
//
// Deploy:
//   supabase functions deploy create-pix-charge --no-verify-jwt
//
// Secret necessária:
//   supabase secrets set ASAAS_API_KEY="$aact_prod_..."
// ══════════════════════════════════════════════════════════════

// ⚠️  Usa Deno.serve() nativo — NÃO importar serve() do std.
//     O runtime atual do Supabase Edge Functions espera Deno.serve;
//     a importação do std pode causar falha silenciosa no boot
//     (logs mostram apenas "boot → shutdown" sem nenhuma execução).

// Declaração mínima do runtime Deno para o TypeScript language server do IDE.
// No ambiente Supabase Edge Functions o global Deno real substitui isso automaticamente.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void
  env: { get(key: string): string | undefined }
}

const ASAAS_BASE = "https://api.asaas.com/v3"
const EXPIRES_MS = 30 * 60 * 1000 // 30 minutos

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ── Logger ────────────────────────────────────────────────────
// Prefixo fixo facilita filtrar nos logs do Supabase Dashboard.
const L = "[create-pix-charge]"
function info(msg: string, data?: unknown)  { console.log(L,  "[INFO]",  msg, data ?? "") }
function warn(msg: string, data?: unknown)  { console.warn(L, "[WARN]",  msg, data ?? "") }
function err(msg: string,  data?: unknown)  { console.error(L,"[ERROR]", msg, data ?? "") }

// ── Handler ───────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {

  // CORS preflight — deve ser o primeiro check
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }

  info("Requisição recebida", { method: req.method, url: req.url })

  // ── 1. Parse do body ───────────────────────────────────────
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
    info("Body recebido", body)
  } catch {
    err("Body não é JSON válido")
    return jsonErr("Body inválido — envie JSON com { amount: number }", 400)
  }

  // ── 2. Validação do amount ─────────────────────────────────
  const rawAmount = body.amount
  const amount = typeof rawAmount === "number"
    ? rawAmount
    : parseFloat(String(rawAmount ?? ""))

  if (!isFinite(amount) || amount < 10) {
    err("Valor inválido", { rawAmount, parsed: amount })
    return jsonErr(`Valor inválido: "${rawAmount}". Mínimo: R$ 10,00`, 400)
  }

  const amountFmt = parseFloat(amount.toFixed(2))
  info("Valor validado", { amountFmt })

  // ── 3. Leitura da secret ───────────────────────────────────
  const apiKey = Deno.env.get("ASAAS_API_KEY") ?? ""
  if (!apiKey) {
    err("ASAAS_API_KEY não encontrada nas secrets do Supabase")
    return jsonErr("Erro de configuração: ASAAS_API_KEY ausente", 500)
  }
  // Loga apenas o prefixo — nunca a chave completa
  info("ASAAS_API_KEY carregada", { preview: apiKey.slice(0, 14) + "…" })

  // ── 4. Chamada à Asaas ─────────────────────────────────────
  const asaasBody = {
    value:       amountFmt,
    description: "Depósito NexusYield — Demo Universitária de Economia e Dados",
  }
  info("Chamando Asaas /pix/qrCodes/static", asaasBody)

  let asaasRes: Response
  try {
    asaasRes = await fetch(`${ASAAS_BASE}/pix/qrCodes/static`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": apiKey,
      },
      body: JSON.stringify(asaasBody),
    })
  } catch (fetchErr) {
    // Falha de rede (DNS, timeout, etc.)
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    err("Falha de rede ao chamar Asaas", { msg })
    return jsonErr(`Falha de rede: ${msg}`, 502)
  }

  info("Asaas respondeu", { status: asaasRes.status })

  // ── 5. Lê o corpo bruto ANTES de tentar parsear como JSON ──
  //    Isso evita que .json() lance se a Asaas retornar HTML ou texto.
  const rawText = await asaasRes.text()

  let asaasData: Record<string, unknown> = {}
  try {
    asaasData = JSON.parse(rawText)
  } catch {
    // Asaas retornou algo que não é JSON (ex: HTML de gateway)
    err("Asaas retornou resposta não-JSON", { status: asaasRes.status, body: rawText.slice(0, 300) })
    return jsonErr(`Asaas retornou status ${asaasRes.status} com resposta inesperada`, 502)
  }

  // ── 6. Trata erro da Asaas ─────────────────────────────────
  if (!asaasRes.ok) {
    // Asaas formata erros como { errors: [{ code, description }] }
    const errors = Array.isArray(asaasData.errors)
      ? (asaasData.errors as Array<{ description?: string; code?: string }>)
          .map(e => `[${e.code ?? "?"}] ${e.description ?? JSON.stringify(e)}`)
          .join(" | ")
      : JSON.stringify(asaasData)

    err("Asaas retornou erro", { status: asaasRes.status, errors })
    return jsonErr(`Asaas (${asaasRes.status}): ${errors}`, 502)
  }

  // ── 7. Extrai campos úteis ─────────────────────────────────
  const payload      = typeof asaasData.payload      === "string" ? asaasData.payload      : ""
  const encodedImage = typeof asaasData.encodedImage === "string" ? asaasData.encodedImage : ""

  if (!payload)      warn("Asaas não retornou payload",      { fullResponse: asaasData })
  if (!encodedImage) warn("Asaas não retornou encodedImage", { fullResponse: asaasData })

  const expiresAt = new Date(Date.now() + EXPIRES_MS).toISOString()
  info("Sucesso", { payloadLen: payload.length, imageLen: encodedImage.length, expiresAt })

  return jsonOk({ payload, encodedImage, expiresAt, amount: amountFmt })
})

// ── Helpers ────────────────────────────────────────────────────
function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status:  200,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function jsonErr(error: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
