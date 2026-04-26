// ══════════════════════════════════════════════════════════════
// NEXUSYIELD — Supabase Edge Function: create-pix-charge
//
// Deploy:
//   supabase secrets set ASAAS_API_KEY="$aact_prod_..."
//   supabase functions deploy create-pix-charge
//
// Recebe: { amount: number }  (mínimo R$ 10,00)
// Retorna: { ok, payload, encodedImage, expiresAt, amount }
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ASAAS_BASE = 'https://api.asaas.com/v3'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // ── 1. Parse e validação do body ───────────────────────────
    let body: { amount?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonErr('Body inválido — envie JSON com { amount }', 400)
    }

    const amount = typeof body.amount === 'number' ? body.amount : NaN
    if (!isFinite(amount) || amount < 10) {
      return jsonErr('Valor mínimo: R$ 10,00', 400)
    }

    // ── 2. Chave da Asaas via secret (NUNCA exposta no frontend) ─
    const key = Deno.env.get('ASAAS_API_KEY')
    if (!key) {
      console.error('[create-pix-charge] ASAAS_API_KEY não configurada nas secrets')
      return jsonErr('Erro de configuração do servidor', 500)
    }

    // ── 3. Cria QR Code Pix estático na Asaas ──────────────────
    //    Endpoint: POST /v3/pix/qrCodes/static
    //    Vantagem: não exige cadastro de cliente (customer)
    const asaasBody = {
      value:       parseFloat(amount.toFixed(2)),
      description: 'Depósito NexusYield — Demonstração Universitária de Economia e Dados',
    }

    const asaasRes = await fetch(`${ASAAS_BASE}/pix/qrCodes/static`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': key,
      },
      body: JSON.stringify(asaasBody),
    })

    if (!asaasRes.ok) {
      const errText = await asaasRes.text()
      console.error('[create-pix-charge] Asaas error:', asaasRes.status, errText)
      return jsonErr(
        `Asaas retornou status ${asaasRes.status} — verifique a API Key e o saldo da conta`,
        502,
      )
    }

    const qr = await asaasRes.json()

    // ── 4. Extrai os campos úteis da resposta ──────────────────
    //    payload      → string "Pix Copia e Cola" (EMV QR)
    //    encodedImage → base64 PNG do QR Code
    const payload      = typeof qr.payload      === 'string' ? qr.payload      : ''
    const encodedImage = typeof qr.encodedImage === 'string' ? qr.encodedImage : ''

    if (!payload) {
      console.warn('[create-pix-charge] Asaas não retornou payload:', JSON.stringify(qr))
    }

    // ── 5. Retorna ao frontend ─────────────────────────────────
    return jsonOk({
      payload,
      encodedImage,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min
      amount:    parseFloat(amount.toFixed(2)),
    })

  } catch (e) {
    console.error('[create-pix-charge] Uncaught error:', e)
    return jsonErr('Erro interno do servidor', 500)
  }
})

// ── Helpers ────────────────────────────────────────────────────
function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function jsonErr(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
