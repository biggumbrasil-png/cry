-- ══════════════════════════════════════════════════════════════
-- NEXUSYIELD — Migração SQL: tabela pix_payments
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ══════════════════════════════════════════════════════════════

-- 1. Extensão para UUID (já habilitada no Supabase, mas por segurança)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela principal de cobranças Pix
CREATE TABLE IF NOT EXISTS public.pix_payments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referência interna
  user_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- IDs da Asaas
  asaas_id          TEXT        NOT NULL UNIQUE,   -- ex: pay_XXXXXXXXXXXXXXXX
  asaas_invoice_url TEXT,                           -- link para fatura (opcional)

  -- Valor e estado
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 10),
  status            TEXT        NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','RECEIVED','CONFIRMED','OVERDUE','REFUNDED','CANCELLED')),

  -- Dados do QR Code (preenchidos na criação)
  pix_qr_code       TEXT,       -- código copia e cola (payload completo)
  pix_qr_code_url   TEXT,       -- URL da imagem do QR Code da Asaas

  -- Controle de tempo
  expires_at        TIMESTAMPTZ,                   -- vencimento da cobrança
  paid_at           TIMESTAMPTZ,                   -- quando foi confirmado pela Asaas
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_payments_updated_at ON public.pix_payments;
CREATE TRIGGER trg_pix_payments_updated_at
  BEFORE UPDATE ON public.pix_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Índices recomendados
CREATE INDEX IF NOT EXISTS idx_pix_payments_user_id   ON public.pix_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_pix_payments_asaas_id  ON public.pix_payments(asaas_id);
CREATE INDEX IF NOT EXISTS idx_pix_payments_status     ON public.pix_payments(status);
CREATE INDEX IF NOT EXISTS idx_pix_payments_created_at ON public.pix_payments(created_at DESC);

-- 5. Row Level Security (RLS)
ALTER TABLE public.pix_payments ENABLE ROW LEVEL SECURITY;

-- Usuários NÃO podem ler/escrever diretamente nessa tabela pelo anon_key
-- Toda mutação vem das Edge Functions (service_role)
-- Leitura do QR Code é feita via Edge Function também — front não acessa direto

-- Policy: service_role tem acesso total (padrão do Supabase)
-- Policy: anon/authenticated NÃO têm acesso (segurança máxima)
-- (sem policies = tudo bloqueado para anon/authenticated, só service_role passa)

-- 6. Comentários para documentação
COMMENT ON TABLE  public.pix_payments                IS 'Cobranças Pix criadas via Asaas API';
COMMENT ON COLUMN public.pix_payments.asaas_id       IS 'ID único da cobrança no sistema Asaas';
COMMENT ON COLUMN public.pix_payments.pix_qr_code    IS 'Payload completo para Copia e Cola';
COMMENT ON COLUMN public.pix_payments.pix_qr_code_url IS 'URL da imagem do QR Code (PNG) gerada pela Asaas';
COMMENT ON COLUMN public.pix_payments.status          IS 'PENDING=aguardando | RECEIVED=pago | CONFIRMED=confirmado | OVERDUE=vencido';
