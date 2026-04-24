// ══════════════════════════════════════════════════════════════
// NEXUSYIELD — Seção C: Alterações no JavaScript do finalboss.html
//
// INSTRUÇÕES DE USO:
//   1. Localize cada bloco marcado com "/* ── LOCALIZAR ── */"
//   2. Substitua (ou adicione) o trecho indicado no seu HTML
//
// As alterações são:
//   C1. CSS do modal Pix (adicionar ao bloco <style>)
//   C2. HTML do modal Pix (adicionar antes do </div> final do #view-dash)
//   C3. Substituição da função processDeposito()
//   C4. Adição das funções auxiliares do modal Pix
// ══════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════
// C1. CSS — Cole dentro do <style> do seu HTML (qualquer lugar)
// ════════════════════════════════════════════════════════════
/*

.pix-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(13,7,23,.82);
  backdrop-filter: blur(8px);
  z-index: 400;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  opacity: 0; pointer-events: none;
  transition: opacity .3s;
}
.pix-modal-overlay.show { opacity: 1; pointer-events: auto; }

.pix-modal {
  background: #1A1030;
  border: 1px solid rgba(155,48,255,.28);
  border-radius: 28px;
  box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(155,48,255,.1);
  padding: 36px 32px 32px;
  width: 100%; max-width: 420px;
  text-align: center;
  transform: translateY(20px) scale(.97);
  transition: transform .35s cubic-bezier(.22,1,.36,1);
}
.pix-modal-overlay.show .pix-modal { transform: translateY(0) scale(1); }

.pix-modal-ico { font-size: 48px; margin-bottom: 10px; display: block; }
.pix-modal-title { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 4px; }
.pix-modal-sub {
  font-size: 13px; color: var(--dm); margin-bottom: 24px; line-height: 1.5;
}
.pix-modal-sub strong { color: #C580FF; }

/* Contador regressivo */
.pix-timer {
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(245,158,11,.1);
  border: 1px solid rgba(245,158,11,.28);
  border-radius: 50px; padding: 5px 14px;
  font-size: 12.5px; font-weight: 600; color: #FCD34D;
  margin-bottom: 20px;
}
.pix-timer-dot { width: 7px; height: 7px; background: #F59E0B; border-radius: 50%;
  animation: pd 1.4s ease-in-out infinite; }

/* QR Code */
.pix-qr-wrap {
  background: #fff;
  border-radius: 16px; padding: 16px;
  margin: 0 auto 18px; width: fit-content;
  box-shadow: 0 4px 24px rgba(0,0,0,.4);
}
.pix-qr-wrap img { display: block; width: 180px; height: 180px; border-radius: 8px; }
.pix-qr-placeholder {
  width: 180px; height: 180px; background: #f3f4f6;
  border-radius: 8px; display: flex; align-items: center;
  justify-content: center; font-size: 14px; color: #9CA3AF;
  flex-direction: column; gap: 8px;
}

/* Copia e Cola */
.pix-copy-label {
  font-size: 10.5px; font-weight: 700; letter-spacing: .1em;
  color: #9B30FF; text-transform: uppercase; margin-bottom: 8px;
}
.pix-copy-box {
  background: rgba(255,255,255,.06);
  border: 1.5px solid rgba(155,48,255,.25);
  border-radius: 12px; padding: 11px 14px;
  font-size: 11px; color: #C580FF; font-family: monospace;
  word-break: break-all; text-align: left;
  max-height: 72px; overflow-y: auto; margin-bottom: 14px;
  user-select: all;
}
.pix-copy-box::-webkit-scrollbar { width: 3px; }
.pix-copy-box::-webkit-scrollbar-thumb { background: rgba(155,48,255,.35); border-radius: 3px; }

.btn-pix-copy {
  width: 100%; padding: 13px;
  background: linear-gradient(135deg,#5500A0,#9B30FF);
  color: #fff; border: none; border-radius: 13px;
  font-size: 14.5px; font-weight: 700; font-family: 'Outfit',sans-serif;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  gap: 8px; margin-bottom: 10px; position: relative; overflow: hidden;
  transition: filter .15s, transform .15s;
  box-shadow: 0 5px 22px rgba(107,0,194,.38);
}
.btn-pix-copy::before { content:''; position:absolute; inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.18),transparent 55%); pointer-events:none; }
.btn-pix-copy:hover { filter: brightness(1.08); transform: translateY(-1px); }
.btn-pix-copy.copied { background: linear-gradient(135deg,#16A34A,#22C55E)!important;
  box-shadow: 0 5px 22px rgba(34,197,94,.38)!important; }

.btn-pix-cancel {
  width: 100%; padding: 11px;
  background: transparent; color: var(--dm);
  border: 1.5px solid rgba(255,255,255,.1); border-radius: 13px;
  font-size: 13.5px; font-weight: 600; font-family: 'Outfit',sans-serif;
  cursor: pointer; transition: border-color .2s, color .2s;
}
.btn-pix-cancel:hover { border-color: rgba(239,68,68,.4); color: #FC8181; }

.pix-status-waiting {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  font-size: 12px; color: var(--dm); margin-top: 14px;
}
.pix-spin {
  width: 14px; height: 14px;
  border: 2px solid rgba(155,48,255,.3);
  border-top-color: #9B30FF; border-radius: 50%;
  animation: sp .75s linear infinite; flex-shrink: 0;
}

*/


// ════════════════════════════════════════════════════════════
// C2. HTML do Modal Pix
// Cole ANTES do fechamento do bloco #view-dash, junto com os
// outros modais (dm-d, dm-s, etc.)
// ════════════════════════════════════════════════════════════
/*

<!-- Modal PIX — QR Code + Copia e Cola -->
<div class="pix-modal-overlay" id="pix-modal-overlay">
  <div class="pix-modal">
    <span class="pix-modal-ico">🏦</span>
    <div class="pix-modal-title">Pague via Pix</div>
    <div class="pix-modal-sub">
      Valor: <strong id="pix-modal-valor">R$ 0,00</strong><br>
      Escaneie o QR Code ou copie o código abaixo
    </div>

    <div class="pix-timer">
      <div class="pix-timer-dot"></div>
      <span>Expira em <strong id="pix-timer-count">30:00</strong></span>
    </div>

    <div class="pix-qr-wrap">
      <img id="pix-qr-img" src="" alt="QR Code Pix" style="display:none" />
      <div id="pix-qr-placeholder" class="pix-qr-placeholder">
        <div class="pix-spin" style="width:28px;height:28px;border-width:3px"></div>
        <span>Gerando QR...</span>
      </div>
    </div>

    <div class="pix-copy-label">Pix Copia e Cola</div>
    <div class="pix-copy-box" id="pix-copy-code">Aguardando...</div>

    <button class="btn-pix-copy" id="btn-pix-copy" onclick="copiarCodigoPix()">
      <span id="pix-copy-ico">📋</span>
      <span id="pix-copy-lbl">Copiar código Pix</span>
    </button>

    <div class="pix-status-waiting" id="pix-status-waiting">
      <div class="pix-spin"></div>
      <span>Aguardando confirmação do pagamento...</span>
    </div>

    <button class="btn-pix-cancel" onclick="fecharModalPix()">
      Cancelar / Fechar
    </button>
  </div>
</div>

*/


// ════════════════════════════════════════════════════════════
// C3. Substituir a função processDeposito() INTEGRALMENTE
// Localize no HTML: "function processDeposito() {"
// e substitua todo o bloco até o "}" de fechamento
// ════════════════════════════════════════════════════════════

async function processDeposito() {
  const v = parseFloat(document.getElementById('d-v').value);

  if (!v || v < 10) {
    gToast('error', 'Valor mínimo: R$ 10,00.');
    return;
  }

  const btn = document.getElementById('btn-d');
  btn.disabled = true;
  document.getElementById('sp-d').style.display = 'block';
  document.getElementById('btn-d-l').textContent = 'Gerando Pix...';

  try {
    // Chama a Edge Function create-pix-charge
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/create-pix-charge`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ userId: CU.id, amount: v }),
      }
    );

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || 'Erro ao criar cobrança');
    }

    // Fecha o modal de depósito
    closeDM('dm-d');
    document.getElementById('d-v').value = '';

    // Exibe o modal do Pix com os dados recebidos
    abrirModalPix({
      amount:      data.amount,
      pixQrCode:   data.pixQrCode,
      pixQrCodeUrl: data.pixQrCodeUrl,
      expiresAt:   data.expiresAt,
      asaasId:     data.asaasId,
    });

  } catch (e) {
    console.error('[NexusYield] processDeposito error:', e);
    gToast('error', e.message || 'Erro ao gerar cobrança Pix. Tente novamente.');
  } finally {
    btn.disabled = false;
    document.getElementById('sp-d').style.display = 'none';
    document.getElementById('btn-d-l').textContent = 'Gerar Pix';
  }
}


// ════════════════════════════════════════════════════════════
// C4. Funções auxiliares do modal Pix
// Cole APÓS a função processDeposito() (ou no final do <script>)
// ════════════════════════════════════════════════════════════

/* Variável de controle do timer do Pix */
let _pixTimerInterval = null;
let _pixPollingInterval = null;
let _pixCurrentAsaasId = null;

/**
 * Abre o modal Pix com o QR Code recebido da Edge Function
 */
function abrirModalPix({ amount, pixQrCode, pixQrCodeUrl, expiresAt, asaasId }) {
  _pixCurrentAsaasId = asaasId;

  // Preenche valor
  document.getElementById('pix-modal-valor').textContent = fmtBRL(amount);

  // Preenche código Copia e Cola
  const codeEl = document.getElementById('pix-copy-code');
  codeEl.textContent = pixQrCode || 'Código indisponível';

  // Exibe QR Code (imagem base64 ou URL)
  const imgEl = document.getElementById('pix-qr-img');
  const phEl  = document.getElementById('pix-qr-placeholder');

  if (pixQrCodeUrl) {
    // A Asaas retorna base64 — exibe como data URI
    const isBase64 = !pixQrCodeUrl.startsWith('http');
    imgEl.src = isBase64 ? `data:image/png;base64,${pixQrCodeUrl}` : pixQrCodeUrl;
    imgEl.style.display = 'block';
    phEl.style.display  = 'none';
  } else {
    imgEl.style.display = 'none';
    phEl.style.display  = 'flex';
    phEl.innerHTML = '<span style="font-size:13px;color:#9CA3AF">QR Code indisponível<br>Use o código abaixo</span>';
  }

  // Inicia contador regressivo
  _iniciarTimerPix(expiresAt);

  // Inicia polling para verificar pagamento (a cada 5s por até 30 min)
  _iniciarPollingPix(asaasId);

  // Exibe modal
  document.getElementById('pix-modal-overlay').classList.add('show');
}

/**
 * Fecha o modal e limpa timers
 */
function fecharModalPix() {
  document.getElementById('pix-modal-overlay').classList.remove('show');
  _pararTimerPix();
  _pararPollingPix();
}

/**
 * Copia o código Pix para o clipboard
 */
function copiarCodigoPix() {
  const code = document.getElementById('pix-copy-code').textContent;
  const btn  = document.getElementById('btn-pix-copy');

  navigator.clipboard.writeText(code).then(() => {
    btn.classList.add('copied');
    document.getElementById('pix-copy-ico').textContent = '✅';
    document.getElementById('pix-copy-lbl').textContent = 'Copiado!';
    setTimeout(() => {
      btn.classList.remove('copied');
      document.getElementById('pix-copy-ico').textContent = '📋';
      document.getElementById('pix-copy-lbl').textContent = 'Copiar código Pix';
    }, 2500);
  }).catch(() => {
    gToast('error', 'Não foi possível copiar. Copie manualmente.');
  });
}

/**
 * Contador regressivo até expiresAt
 */
function _iniciarTimerPix(expiresAt) {
  _pararTimerPix();
  const expiresMs = new Date(expiresAt).getTime();

  function tick() {
    const diff = Math.max(0, expiresMs - Date.now());
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const el   = document.getElementById('pix-timer-count');
    if (el) el.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    if (diff <= 0) {
      _pararTimerPix();
      _pararPollingPix();
      // Notifica expiração
      const overlay = document.getElementById('pix-modal-overlay');
      if (overlay && overlay.classList.contains('show')) {
        gToast('error', '⏰ Código Pix expirado. Gere um novo depósito.');
        fecharModalPix();
      }
    }
  }

  tick();
  _pixTimerInterval = setInterval(tick, 1000);
}

function _pararTimerPix() {
  if (_pixTimerInterval) { clearInterval(_pixTimerInterval); _pixTimerInterval = null; }
}

/**
 * Polling: verifica a cada 5s se o pagamento foi confirmado.
 * Quando confirmado, atualiza o front-end sem precisar recarregar.
 *
 * NOTA: A confirmação real vem via webhook (Edge Function asaas-webhook).
 * O polling apenas detecta a mudança no banco Supabase para atualizar a UI.
 */
function _iniciarPollingPix(asaasId) {
  _pararPollingPix();
  let tentativas = 0;
  const MAX_TENTATIVAS = 360; // 360 × 5s = 30 min

  _pixPollingInterval = setInterval(async () => {
    tentativas++;
    if (tentativas > MAX_TENTATIVAS) {
      _pararPollingPix();
      return;
    }

    try {
      // Consulta o status do pagamento direto no Supabase
      // Usa a anon key — sem RLS em pix_payments, então usamos o check via usuário
      // Alternativa segura: criar Edge Function get-payment-status
      // Por simplicidade, verificamos se o balance do usuário mudou
      const { data: u } = await _sb
        .from('users')
        .select('balance, total_deposited')
        .eq('id', CU.id)
        .maybeSingle();

      if (u && parseFloat(u.balance) > liveBalance) {
        // Pagamento confirmado — atualiza UI
        _pararPollingPix();
        fecharModalPix();

        const novoBalance = parseFloat(u.balance);
        const diff        = parseFloat((novoBalance - liveBalance).toFixed(2));

        liveBalance = novoBalance;
        await DB.fetchUser(CU.id);
        await DB.fetchTxns(CU.id);
        CU = DB.getUser(CU.id);

        renderDash();
        renderTxns();
        renderChart();

        playKaching();
        gToast('success', `✅ Pix de ${fmtBRL(diff)} confirmado! Saldo atualizado.`);
      }
    } catch (e) {
      console.error('[NexusYield] Polling error:', e);
    }
  }, 5000);
}

function _pararPollingPix() {
  if (_pixPollingInterval) { clearInterval(_pixPollingInterval); _pixPollingInterval = null; }
}

// Fecha modal ao clicar no overlay
document.getElementById('pix-modal-overlay')?.addEventListener('click', function(e) {
  if (e.target === this) fecharModalPix();
});
