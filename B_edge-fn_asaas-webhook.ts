// ══════════════════════════════════════════════════════════════
// NEXUSYIELD — Edge Function: asaas-webhook
// Caminho no projeto Supabase: supabase/functions/asaas-webhook/index.ts
//
// Responsabilidades:
//   1. Recebe notificação POST da Asaas (evento PAYMENT_RECEIVED / PAYMENT_CONFIRMED)
//   2. Valida assinatura (token fixo configurado no painel da Asaas)
//   3. Busca o pix_payment no banco pelo asaas_id
//   4. Credita o usuário (balance + total_deposited + last_deposit_at)
//   5. Credita 50% ao indicante (balance + referral_earnings + txn tipo "indicacao")
//   6. Registra transação de depósito
//   7. Marca pix_payment como RECEIVED
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constantes ───────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-webhook-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Eventos que disparam crédito (a Asaas pode enviar RECEIVED ou CONFIRMED)
const PAYMENT_OK_EVENTS = new Set([
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
])

// ── Handler principal ────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // 1. Valida token de segurança do webhook
    //    Configure em: Asaas > Integrações > Webhooks > Token de acesso
    //    E adicione como secret no Supabase: ASAAS_WEBHOOK_TOKEN
    const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
    if (webhookToken) {
      const receivedToken = req.headers.get('asaas-webhook-token') ?? ''
      if (receivedToken !== webhookToken) {
        console.warn('[asaas-webhook] Token inválido recebido')
        return new Response('Unauthorized', { status: 401 })
      }
    }

    // 2. Parse do payload
    const body = await req.json() as AsaasWebhookPayload

    console.log('[asaas-webhook] Evento recebido:', body.event, '| ID:', body.payment?.id)

    // 3. Filtra somente eventos de pagamento confirmado
    if (!PAYMENT_OK_EVENTS.has(body.event)) {
      // Retorna 200 para a Asaas não retentar
      return new Response('Evento ignorado', { status: 200 })
    }

    const asaasId = body.payment?.id
    const paidAmount = body.payment?.value

    if (!asaasId || !paidAmount) {
      console.error('[asaas-webhook] Payload inválido:', body)
      return new Response('Payload inválido', { status: 400 })
    }

    // 4. Cliente Supabase com service_role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 5. Busca o registro de pagamento no banco
    const { data: pixPayment, error: pixErr } = await supabase
      .from('pix_payments')
      .select('*')
      .eq('asaas_id', asaasId)
      .maybeSingle()

    if (pixErr || !pixPayment) {
      console.error('[asaas-webhook] pix_payment não encontrado para asaas_id:', asaasId)
      // Retorna 200 para evitar retry loop da Asaas
      return new Response('Pagamento não encontrado (ignorando)', { status: 200 })
    }

    // 6. Idempotência: se já foi processado, ignora
    if (pixPayment.status === 'RECEIVED' || pixPayment.status === 'CONFIRMED') {
      console.log('[asaas-webhook] Pagamento já processado anteriormente. Ignorando.')
      return new Response('Já processado', { status: 200 })
    }

    const userId = pixPayment.user_id as string
    const amount = parseFloat(paidAmount.toString())
    const now = new Date().toISOString()

    // 7. Busca o usuário que depositou
    const { data: usuario, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (userErr || !usuario) {
      console.error('[asaas-webhook] Usuário não encontrado:', userId)
      return new Response('Usuário não encontrado', { status: 500 })
    }

    // 8. Credita o depósito ao usuário
    const novoBalance        = parseFloat((parseFloat(usuario.balance || 0) + amount).toFixed(2))
    const novoTotalDeposited = parseFloat((parseFloat(usuario.total_deposited || 0) + amount).toFixed(2))

    const { error: updateUserErr } = await supabase
      .from('users')
      .update({
        balance:          novoBalance,
        total_deposited:  novoTotalDeposited,
        last_deposit_at:  now,
      })
      .eq('id', userId)

    if (updateUserErr) {
      console.error('[asaas-webhook] Erro ao atualizar usuário:', updateUserErr)
      return new Response('Erro ao creditar usuário', { status: 500 })
    }

    // 9. Registra transação de depósito
    await supabase.from('transactions').insert({
      user_id:     userId,
      type:        'deposito',
      amount:      amount,
      date:        now,
      description: `Depósito via Pix — Asaas #${asaasId}`,
    })

    // 10. Comissão de indicação: 50% para o indicante (se houver)
    if (usuario.referred_by) {
      const indicanteId = usuario.referred_by as string
      const comissao    = parseFloat((amount * 0.50).toFixed(2))

      // Busca dados do indicante
      const { data: indicante } = await supabase
        .from('users')
        .select('id, balance, referral_earnings, referrals, username')
        .eq('id', indicanteId)
        .maybeSingle()

      if (indicante) {
        const novoBalanceInd     = parseFloat((parseFloat(indicante.balance || 0) + comissao).toFixed(2))
        const novoRefEarnings    = parseFloat((parseFloat(indicante.referral_earnings || 0) + comissao).toFixed(2))

        // Atualiza o array de referrals com flag de "qualificado" (depositou)
        const referrals: ReferralEntry[] = Array.isArray(indicante.referrals)
          ? indicante.referrals
          : []

        // Encontra a entrada deste indicado e marca como qualificado
        const referralsAtualizados = referrals.map((r: ReferralEntry) =>
          r.username === usuario.username
            ? { ...r, qualified: true, depositedAt: now }
            : r
        )

        // Credita o indicante
        await supabase.from('users').update({
          balance:           novoBalanceInd,
          referral_earnings: novoRefEarnings,
          referrals:         referralsAtualizados,
        }).eq('id', indicanteId)

        // Registra transação de comissão para o indicante
        await supabase.from('transactions').insert({
          user_id:     indicanteId,
          type:        'indicacao',
          amount:      comissao,
          date:        now,
          description: `Comissão de indicação 50% — @${usuario.username} depositou ${fmtBRL(amount)}`,
        })

        console.log(
          `[asaas-webhook] Comissão de ${fmtBRL(comissao)} creditada ao indicante ${indicanteId}`
        )
      }
    }

    // 11. Atualiza o status do pix_payment para RECEIVED
    await supabase.from('pix_payments').update({
      status:  'RECEIVED',
      paid_at: now,
    }).eq('asaas_id', asaasId)

    console.log(`[asaas-webhook] ✅ Pagamento processado com sucesso: ${asaasId} | R$ ${amount}`)

    // Retorna 200 para a Asaas confirmar recebimento do webhook
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[asaas-webhook] Uncaught error:', err)
    // IMPORTANTE: retornar 500 faz a Asaas retentar o webhook — cuidado com idempotência
    return new Response('Erro interno', { status: 500 })
  }
})

// ── Helpers ──────────────────────────────────────────────────
function fmtBRL(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Tipos ────────────────────────────────────────────────────
interface AsaasWebhookPayload {
  event:   string
  payment: {
    id:                string
    value:             number
    netValue?:         number
    status?:           string
    billingType?:      string
    externalReference?: string
  }
}

interface ReferralEntry {
  username:    string
  date:        string
  qualified?:  boolean
  depositedAt?: string
}
