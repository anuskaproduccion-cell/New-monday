(() => {
  const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const root = () => document.getElementById('modal-root');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function closeModal() {
    const host = root();
    if (host) host.innerHTML = '';
  }

  function modal(title, body, actions = '') {
    const host = root();
    if (!host) return;
    host.innerHTML = `<div class="backup-modal-backdrop"><div class="backup-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="backup-modal-head"><h2>${escapeHtml(title)}</h2><button type="button" data-backup-close aria-label="Cerrar">×</button></div><div class="backup-modal-body">${body}</div><div class="backup-modal-actions">${actions}</div></div></div>`;
    host.querySelectorAll('[data-backup-close]').forEach(button => button.addEventListener('click', closeModal));
    host.querySelector('.backup-modal-backdrop')?.addEventListener('click', event => {
      if (event.target.classList.contains('backup-modal-backdrop')) closeModal();
    });
  }

  function notify(message, kind = 'info') {
    if (typeof app !== 'undefined' && typeof app.toast === 'function') return app.toast(message, kind);
    const toastRoot = document.getElementById('toast-root');
    if (!toastRoot) return;
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.textContent = message;
    toastRoot.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  }

  async function downloadBackup() {
    try {
      const response = await fetch('/api/backups/excel');
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Error ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `NEW_MONDAY_BACKUP_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify('Backup Excel generado.');
    } catch (error) {
      notify(`No se pudo generar el backup: ${error.message}`, 'error');
    }
  }

  function conflictList(conflicts = []) {
    if (!conflicts.length) return '<p>No se han detectado conflictos.</p>';
    return `<div class="backup-conflicts">${conflicts.slice(0, 50).map(conflict => `<div class="backup-conflict"><strong>${escapeHtml(conflict.sheet || conflict.code || 'Conflicto')}</strong>${conflict.row ? `<span>Fila ${conflict.row}</span>` : ''}<p>${escapeHtml(conflict.message || 'Cambio no recuperable automáticamente.')}</p></div>`).join('')}${conflicts.length > 50 ? `<p>…y ${conflicts.length - 50} conflictos más.</p>` : ''}</div>`;
  }

  async function previewRecovery(file) {
    modal('Analizando Excel', '<div class="backup-loading">Comprobando cambios y conflictos…</div>');
    try {
      const response = await fetch('/api/backups/excel/recovery/preview', {
        method: 'POST',
        headers: {
          'Content-Type': EXCEL_TYPE,
          'X-File-Name': file.name
        },
        body: await file.arrayBuffer()
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 409) throw new Error(payload.error || `Error ${response.status}`);

      if (payload.status === 'blocked' || payload.conflicts?.length) {
        modal(
          'Recuperación bloqueada',
          `<p class="backup-warning">No se ha modificado ningún dato. Corrige o revisa estos conflictos antes de recuperar.</p>${conflictList(payload.conflicts)}`,
          '<button class="button" type="button" data-backup-close>Cerrar</button>'
        );
        return;
      }

      const summary = payload.summary || {};
      const body = `<p>El Excel se ha analizado sin escribir datos. Revisa el resumen antes de aplicar:</p>
        <div class="backup-summary">
          <div><strong>${summary.updates || 0}</strong><span>elementos actualizados</span></div>
          <div><strong>${summary.creates || 0}</strong><span>elementos nuevos</span></div>
          <div><strong>${summary.newSubitems || 0}</strong><span>subelementos nuevos</span></div>
          <div><strong>${summary.archiveActions || 0}</strong><span>archivados</span></div>
          <div><strong>${summary.trashActions || 0}</strong><span>a papelera</span></div>
        </div>
        <p class="backup-policy">Monday original: <strong>0 escrituras</strong>. La recuperación solo afecta a New Monday.</p>
        <label class="backup-confirm-label">Escribe <strong>RECUPERAR</strong> para confirmar<input id="backup-confirm-word" autocomplete="off" spellcheck="false"></label>`;
      const actions = '<button class="button" type="button" data-backup-close>Cancelar</button><button class="button primary" type="button" id="backup-apply" disabled>Aplicar recuperación</button>';
      modal('Vista previa de recuperación', body, actions);

      const input = document.getElementById('backup-confirm-word');
      const apply = document.getElementById('backup-apply');
      input?.addEventListener('input', () => { apply.disabled = input.value.trim().toUpperCase() !== 'RECUPERAR'; });
      apply?.addEventListener('click', () => applyRecovery(payload.runId, payload.confirmationRequired, apply));
    } catch (error) {
      modal('No se pudo analizar el Excel', `<p class="backup-warning">${escapeHtml(error.message)}</p>`, '<button class="button" type="button" data-backup-close>Cerrar</button>');
    }
  }

  async function applyRecovery(runId, confirmation, button) {
    button.disabled = true;
    button.textContent = 'Aplicando…';
    try {
      const response = await fetch(`/api/backups/excel/recovery/runs/${encodeURIComponent(runId)}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
      const applied = payload.applied || {};
      modal('Recuperación completada', `<p>Los cambios del Excel ya están en New Monday.</p><div class="backup-summary"><div><strong>${applied.updated || 0}</strong><span>actualizados</span></div><div><strong>${applied.created || 0}</strong><span>nuevos</span></div><div><strong>${applied.subitems || 0}</strong><span>subelementos</span></div></div><p class="backup-policy">Monday original no ha sido modificado.</p>`, '<button class="button primary" type="button" data-backup-close>Cerrar</button>');
      if (typeof app !== 'undefined' && typeof app.reloadAll === 'function') {
        await app.reloadAll();
        if (typeof app.renderSidebar === 'function') app.renderSidebar();
        if (typeof app.renderCurrentView === 'function') app.renderCurrentView();
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Aplicar recuperación';
      notify(`Recuperación cancelada: ${error.message}`, 'error');
    }
  }

  function chooseRecoveryFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) previewRecovery(file);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-backup-excel')?.addEventListener('click', downloadBackup);
    document.getElementById('btn-recover-excel')?.addEventListener('click', chooseRecoveryFile);
  });
})();
