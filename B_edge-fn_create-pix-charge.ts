// ══════════════════════════════════════════════════════════════
// NEXUSYIELD — Edge Function: create-pix-charge
// Caminho no projeto Supabase: supabase/functions/create-pix-charge/index.ts
//
// Responsabilidades:
//   1. Recebe { userId, amount } do front-end
//   2. Valida o usuário no Supabase
//   3. Cria cobrança Pix na Asaas (produção)
//   4. Salva registro em pix_payments
//   5. Retorna { pixQrCode, pixQrCodeUrl, asaasId, expiresAt }
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constantes ──────────────────────────────────────────────
const ASAAS_BASE_URL = 'https://api.asaas.com/v3'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',            // restrinja ao seu domínio em produção
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Handler principal ────────────────────────────────────────
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // 1. Parse do body
    const { userId, amount } = await req.json() as {
      userId: string
      amount: number
    }

    // 2. Validações básicas
    if (!userId || typeof userId !== 'string') {
      return jsonError('userId inválido', 400)
    }
    if (!amount || amount < 10) {
      return jsonError('Valor mínimo: R$ 10,00', 400)
    }

    // 3. Cliente Supabase com service_role (acesso total, seguro no servidor)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 4. Busca usuário no banco
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, referral_code')
      .eq('id', userId)
      .maybeSingle()

    if (userErr || !user) {
      return jsonError('Usuário não encontrado', 404)
    }

    // 5. Chave da Asaas via variável de ambiente (NUNCA exposta no front)
    const asaasKey = Deno.env.get('ASAAS_API_KEY')
    if (!asaasKey) {
      console.error('[create-pix-charge] ASAAS_API_KEY não configurada')
      return jsonError('Erro de configuração do servidor', 500)
    }

    // 6. Cria cobrança Pix na Asaas
    //    - billingType: PIX
    //    - dueDate: hoje + 30 min (vencimento curto para depósito imediato)
    const dueDate = new Date()
    dueDate.setMinutes(dueDate.getMinutes() + 30)
    const dueDateStr = dueDate.toISOString().split('T')[0] // YYYY-MM-DD

    const asaasPayload = {
      customer:       `nexusyield_${userId.replace(/-/g, '').slice(0, 20)}`, // ID externo único
      billingType:    'PIX',
      value:          parseFloat(amount.toFixed(2)),
      dueDate:        dueDateStr,
      description:    `Depósito NexusYield — @${user.username}`,
      externalReference: userId,   // guarda userId para usar no webhook
      postalService:  false,
    }

    const asaasRes = await fetch(`${ASAAS_BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'access_token':  asaasKey,
      },
      body: JSON.stringify(asaasPayload),
    })

    if (!asaasRes.ok) {
      const errBody = await asaasRes.text()
      console.error('[create-pix-charge] Asaas error:', errBody)
      return jsonError('Erro ao criar cobrança na Asaas', 502)
    }

    const asaasData = await asaasRes.json()
    const asaasId = asaasData.id as string

    // 7. Busca QR Code do Pix na Asaas
    const qrRes = await fetch(`${ASAAS_BASE_URL}/payments/${asaasId}/pixQrCode`, {
      headers: { 'access_token': asaasKey },
    })

    let pixQrCode    = ''
    let pixQrCodeUrl = ''

    if (qrRes.ok) {
      const qrData = await qrRes.json()
      pixQrCode    = qrData.payload       ?? ''  // string Copia e Cola
      pixQrCodeUrl = qrData.encodedImage  ?? ''  // base64 ou URL da imagem
    } else {
      console.warn('[create-pix-charge] Falha ao buscar QR Code:', await qrRes.text())
    }

    // 8. Salva em pix_payments
    const expiresAt = new Date(dueDate)
    expiresAt.setMinutes(expiresAt.getMinutes() + 30)

    const { error: insertErr } = await supabase.from('pix_payments').insert({
      user_id:         userId,
      asaas_id:        asaasId,
      asaas_invoice_url: asaasData.invoiceUrl ?? null,
      amount:          parseFloat(amount.toFixed(2)),
      status:          'PENDING',
      pix_qr_code:     pixQrCode,
      pix_qr_code_url: pixQrCodeUrl,
      expires_at:      expiresAt.toISOString(),
    })

    if (insertErr) {
      // Não falha o fluxo — cobrança já foi criada na Asaas
      console.error('[create-pix-charge] Erro ao salvar pix_payment:', insertErr)
    }

    // 9. Retorna ao front-end apenas o necessário para exibir o QR
    return jsonOk({
      asaasId,
      pixQrCode,
      pixQrCodeUrl,
      expiresAt: expiresAt.toISOString(),
      amount:    parseFloat(amount.toFixed(2)),
    })

  } catch (err) {
    console.error('[create-pix-charge] Uncaught error:', err)
    return jsonError('Erro interno', 500)
  }
})

// ── Helpers de resposta ──────────────────────────────────────
function jsonOk(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...data as object }), {
    status:  200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
