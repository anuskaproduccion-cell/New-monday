(() => {
  const baseRenderItemUpdates = app.renderItemUpdates.bind(app);

  app.safeUpdateLink = function safeUpdateLink(value) {
    try {
      const url = new URL(String(value || '').trim());
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  app.richUpdateInlineHtml = function richUpdateInlineHtml(value) {
    const links = [];
    let source = String(value || '').replace(/\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)]+)\)/gi, (full, label, href) => {
      const safe = this.safeUpdateLink(href);
      if (!safe) return full;
      const token = `@@NM_UPDATE_LINK_${links.length}@@`;
      links.push(`<a href="${this.escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(label)}</a>`);
      return token;
    });
    let html = this.escapeHtml(source);
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    links.forEach((link, index) => { html = html.replace(`@@NM_UPDATE_LINK_${index}@@`, link); });
    return html;
  };

  app.richUpdateHtml = function richUpdateHtml(value) {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let list = [];
    const flushList = () => {
      if (!list.length) return;
      output.push(`<ul>${list.map(line => `<li>${this.richUpdateInlineHtml(line)}</li>`).join('')}</ul>`);
      list = [];
    };

    lines.forEach(line => {
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) {
        list.push(bullet[1]);
        return;
      }
      flushList();
      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) output.push(`<blockquote>${this.richUpdateInlineHtml(quote[1]) || '<br>'}</blockquote>`);
      else if (!line.trim()) output.push('<div class="update-rich-empty"><br></div>');
      else output.push(`<div>${this.richUpdateInlineHtml(line)}</div>`);
    });
    flushList();
    return output.join('');
  };

  app.replaceRichSelection = function replaceRichSelection(input, before, after = before, placeholder = '') {
    if (!input) return;
    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
    const selected = input.value.slice(start, end) || placeholder;
    input.setRangeText(`${before}${selected}${after}`, start, end, 'end');
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  app.prefixRichSelectionLines = function prefixRichSelectionLines(input, prefix) {
    if (!input) return;
    const value = String(input.value || '');
    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = value.indexOf('\n', end);
    const lineEnd = nextBreak < 0 ? value.length : nextBreak;
    const block = value.slice(lineStart, lineEnd).split('\n').map(line => `${prefix}${line}`).join('\n');
    input.setRangeText(block, lineStart, lineEnd, 'select');
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  app.insertRichUpdateLink = function insertRichUpdateLink(input) {
    if (!input) return;
    const href = window.prompt('URL del enlace (https://…):', 'https://');
    if (href === null) return;
    const safe = this.safeUpdateLink(href);
    if (!safe) return this.showToast('El enlace debe usar http o https', true);
    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
    const label = input.value.slice(start, end) || 'Enlace';
    input.setRangeText(`[${label}](${safe})`, start, end, 'end');
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  app.richUpdateToolbarHtml = function richUpdateToolbarHtml(compact = false) {
    return `<div class="update-rich-toolbar ${compact ? 'is-compact' : ''}" role="toolbar" aria-label="Formato de actualización">
      <button type="button" data-rich-update="bold" title="Negrita · Ctrl/Cmd+B"><strong>B</strong></button>
      <button type="button" data-rich-update="italic" title="Cursiva · Ctrl/Cmd+I"><em>I</em></button>
      <button type="button" data-rich-update="code" title="Código">&lt;/&gt;</button>
      <button type="button" data-rich-update="list" title="Lista">☷</button>
      <button type="button" data-rich-update="quote" title="Cita">❝</button>
      <button type="button" data-rich-update="link" title="Enlace">🔗</button>
      <button type="button" data-rich-update="mention" title="Mencionar persona">@</button>
    </div>`;
  };

  app.bindRichUpdateEditor = function bindRichUpdateEditor(form, input, { compact = false } = {}) {
    if (!form || !input || input.dataset.richUpdateBound === 'true') return;
    input.dataset.richUpdateBound = 'true';
    const toolbar = document.createElement('div');
    toolbar.innerHTML = this.richUpdateToolbarHtml(compact);
    const node = toolbar.firstElementChild;
    input.before(node);

    node.querySelectorAll('[data-rich-update]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.richUpdate;
      if (action === 'bold') this.replaceRichSelection(input, '**', '**', 'texto');
      else if (action === 'italic') this.replaceRichSelection(input, '_', '_', 'texto');
      else if (action === 'code') this.replaceRichSelection(input, '`', '`', 'código');
      else if (action === 'list') this.prefixRichSelectionLines(input, '- ');
      else if (action === 'quote') this.prefixRichSelectionLines(input, '> ');
      else if (action === 'link') this.insertRichUpdateLink(input);
      else if (action === 'mention') {
        this.replaceRichSelection(input, '@', '', '');
        this.openMentionPicker?.(input);
      }
    }));

    input.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'b') {
        event.preventDefault();
        this.replaceRichSelection(input, '**', '**', 'texto');
      } else if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'i') {
        event.preventDefault();
        this.replaceRichSelection(input, '_', '_', 'texto');
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        form.requestSubmit?.();
      }
    });
  };

  app.decorateRichUpdates = function decorateRichUpdates(host) {
    if (!host) return;
    host.querySelectorAll('.update-body,.update-reply p').forEach(node => {
      const raw = node.textContent || '';
      node.innerHTML = this.richUpdateHtml(raw);
      node.classList.add('update-rich-rendered');
    });
    this.decorateMentionText?.(host);
  };

  app.upgradeReplyEditors = function upgradeReplyEditors(host) {
    host?.querySelectorAll('.reply-form input[name="body"]').forEach(input => {
      const textarea = document.createElement('textarea');
      textarea.name = 'body';
      textarea.rows = 1;
      textarea.required = input.required;
      textarea.placeholder = input.placeholder || 'Responder…';
      textarea.autocomplete = 'off';
      textarea.className = 'update-rich-reply-input';
      input.replaceWith(textarea);
      this.bindMentionInput?.(textarea);
    });
  };

  app.renderItemUpdates = async function renderItemUpdatesWithRichEditor(itemId) {
    await baseRenderItemUpdates(itemId);
    const host = document.getElementById('updates-panel-body');
    if (!host) return;
    this.upgradeReplyEditors(host);
    const updateForm = host.querySelector('#new-update-form');
    const updateInput = updateForm?.querySelector('textarea[name="body"]');
    if (updateForm && updateInput) this.bindRichUpdateEditor(updateForm, updateInput);
    host.querySelectorAll('.reply-form').forEach(form => {
      const input = form.querySelector('textarea[name="body"]');
      if (input) this.bindRichUpdateEditor(form, input, { compact: true });
    });
    this.decorateRichUpdates(host);
  };
})();
