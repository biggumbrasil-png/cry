-- Migration: CashinPay gateway support
-- Run in Supabase Dashboard → SQL Editor BEFORE deploying the functions.
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE throughout).

-- ── 1. Add gateway columns to pix_payments ────────────────────────────────────
-- Asaas columns (asaas_id, asaas_invoice_url) are intentionally kept.
ALTER TABLE pix_payments
  ADD COLUMN IF NOT EXISTS gateway               TEXT,
  ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_status        TEXT,
  ADD COLUMN IF NOT EXISTS gateway_event_id      TEXT,
  ADD COLUMN IF NOT EXISTS cashinpay_payment_url TEXT;

-- ── 2. Unique partial index for idempotency ────────────────────────────────────
-- Rows without a gateway_transaction_id (legacy Asaas rows) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pix_payments_gateway_txn_id
  ON pix_payments (gateway, gateway_transaction_id)
  WHERE gateway IS NOT NULL AND gateway_transaction_id IS NOT NULL;

-- ── 3. Atomic deposit RPC ─────────────────────────────────────────────────────
-- Called by cashinpay-webhook. Reads user_id and amount from pix_payments
-- (never trusts the webhook payload for those values).
-- Returns: 'credited' | 'already_processed' | 'not_found'
CREATE OR REPLACE FUNCTION process_cashinpay_deposit(
  p_gateway_txn_id   TEXT,
  p_gateway_event_id TEXT       -- may be NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pix pix_payments%ROWTYPE;
BEGIN
  -- Lock the row to prevent duplicate processing under concurrent webhooks
  SELECT * INTO v_pix
  FROM pix_payments
  WHERE gateway = 'cashinpay'
    AND gateway_transaction_id = p_gateway_txn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Idempotency: already credited
  IF v_pix.status = 'paid' THEN
    RETURN 'already_processed';
  END IF;

  -- Mark PIX as paid
  UPDATE pix_payments
  SET
    status           = 'paid',
    gateway_status   = 'paid',
    gateway_event_id = p_gateway_event_id,
    paid_at          = NOW(),
    updated_at       = NOW()
  WHERE id = v_pix.id;

  -- Atomic balance increment (no read-modify-write race)
  UPDATE users
  SET
    balance         = balance         + v_pix.amount,
    total_deposited = total_deposited + v_pix.amount,
    last_deposit_at = NOW()
  WHERE id = v_pix.user_id;

  -- Ledger entry in transactions
  INSERT INTO transactions (user_id, type, amount, date, description)
  VALUES (v_pix.user_id, 'deposito', v_pix.amount, NOW(), 'Depósito via Pix');

  RETURN 'credited';
END;
$$;

GRANT EXECUTE ON FUNCTION process_cashinpay_deposit(TEXT, TEXT) TO service_role;
