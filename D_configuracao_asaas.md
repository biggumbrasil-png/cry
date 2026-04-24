# ══════════════════════════════════════════════════════════════
# NEXUSYIELD — Seção D: Configuração Asaas + Supabase
# ══════════════════════════════════════════════════════════════


## 1. ADICIONAR VARIÁVEIS DE AMBIENTE NAS EDGE FUNCTIONS

No painel do Supabase:
  Acesse: Edge Functions > Manage secrets

Adicione os seguintes secrets:

  ASAAS_API_KEY=<sua_api_key_de_producao>
  ASAAS_WEBHOOK_TOKEN=<token_secreto_que_voce_inventar>  # ex: ny_whk_2026_s3cr3t

  (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetadas automaticamente
   pelo runtime do Supabase — não precisa adicionar)


## 2. FAZER DEPLOY DAS EDGE FUNCTIONS

Pré-requisito: Supabase CLI instalado (npm i -g supabase)

  supabase login
  supabase link --project-ref htofnuhjuoechohahntf

  # Deploy das duas funções
  supabase functions deploy create-pix-charge --no-verify-jwt
  supabase functions deploy asaas-webhook     --no-verify-jwt

  # --no-verify-jwt: webhook da Asaas não envia JWT — desabilita verificação
  # create-pix-charge usa a anon key do front-end para autenticar

Após o deploy, as URLs das funções serão:

  https://htofnuhjuoechohahntf.supabase.co/functions/v1/create-pix-charge
  https://htofnuhjuoechohahntf.supabase.co/functions/v1/asaas-webhook


## 3. CONFIGURAR WEBHOOK NO PAINEL DA ASAAS

  1. Acesse: https://app.asaas.com
  2. Vá em: Configurações > Integrações > Webhooks
  3. Clique em "Adicionar Webhook"
  4. Preencha:

     URL:
       https://htofnuhjuoechohahntf.supabase.co/functions/v1/asaas-webhook

     Token de Acesso:  (mesmo valor que você definiu em ASAAS_WEBHOOK_TOKEN)
       ny_whk_2026_s3cr3t    ← exemplo, use o seu

     Eventos a selecionar (marque apenas estes):
       ✅ PAYMENT_RECEIVED
       ✅ PAYMENT_CONFIRMED

     Ativar webhook: ✅ Sim

  5. Clique em "Salvar"
  6. Use o botão "Testar" para validar a conexão


## 4. VERIFICAR FUNCIONAMENTO (CHECKLIST)

  □ SQL executado no Supabase — tabela pix_payments criada
  □ Edge Functions deployadas e aparecem em Edge Functions > Functions
  □ Secrets ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN configurados
  □ Webhook cadastrado na Asaas com a URL correta e token correto
  □ Teste de depósito no NexusYield → QR Code aparece no modal
  □ Pagamento simulado via painel Asaas → saldo atualiza na tela
  □ Comissão de 50% aparece no saldo do indicante


## 5. ESTRUTURA DE ARQUIVOS DO PROJETO SUPABASE

  supabase/
  ├── functions/
  │   ├── create-pix-charge/
  │   │   └── index.ts       ← Arquivo B_edge-fn_create-pix-charge.ts
  │   └── asaas-webhook/
  │       └── index.ts       ← Arquivo B_edge-fn_asaas-webhook.ts
  └── migrations/
      └── 20260424_pix_payments.sql  ← Arquivo A_sql_migration.sql


## 6. SEGURANÇA — CHECKLIST

  ✅ ASAAS_API_KEY nunca aparece no front-end (só nas Edge Functions)
  ✅ pix_payments tem RLS habilitado — anon/authenticated não têm acesso
  ✅ Webhook validado por token secreto (ASAAS_WEBHOOK_TOKEN)
  ✅ Idempotência implementada: webhook duplicado é ignorado
  ✅ service_role key usada apenas no servidor (Edge Functions)
  ✅ Valor mínimo validado em duas camadas (front + Edge Function)


## 7. FLUXO COMPLETO PARA REFERÊNCIA

  Usuário digita valor → processDeposito() →
    POST /functions/v1/create-pix-charge →
      [Supabase] busca usuário →
      [Asaas API] cria cobrança →
      [Asaas API] busca QR Code →
      [Supabase] salva em pix_payments →
    ← retorna { pixQrCode, pixQrCodeUrl, expiresAt } →
  Modal Pix aparece com QR Code →
  Usuário paga →
  [Asaas] dispara webhook →
    POST /functions/v1/asaas-webhook →
      valida token →
      busca pix_payment pelo asaas_id →
      verifica idempotência →
      credita balance do usuário →
      credita 50% ao indicante (se houver) →
      registra transações →
      marca pix_payment como RECEIVED →
  Polling do front-end detecta mudança de balance →
  UI atualiza, toast de confirmação, ka-ching! 🎉
