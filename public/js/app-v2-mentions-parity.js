(() => {
  const baseRenderItemUpdates = app.renderItemUpdates.bind(app);

  app.mentionCandidates = function mentionCandidates() {
    const seen = new Set();
    return (this.crew || []).map(member => String(member?.name || '').trim()).filter(name => {
      const key = name.toLowerCase();
      if (!name || name === '.' || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  };

  app.mentionContext = function mentionContext(input) {
    const value = String(input?.value || '');
    const caret = Number.isFinite(input?.selectionStart) ? input.selectionStart : value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(^|\s)@([^@\n]{0,60})$/);
    if (!match) return null;
    const query = String(match[2] || '');
    const at = before.lastIndexOf('@');
    return { query, start: at, end: caret };
  };

  app.insertMention = function insertMention(input, person, context) {
    if (!input || !context) return;
    const value = String(input.value || '');
    const next = `${value.slice(0, context.start)}@${person} ${value.slice(context.end)}`;
    input.value = next;
    const caret = context.start + person.length + 2;
    input.focus();
    input.setSelectionRange?.(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  app.openMentionPicker = function openMentionPicker(input) {
    document.querySelectorAll('.mention-picker').forEach(node => node.remove());
    const context = this.mentionContext(input);
    if (!context) return;
    const term = context.query.trim().toLowerCase();
    const candidates = this.mentionCandidates().filter(name => !term || name.toLowerCase().includes(term)).slice(0, 8);
    if (!candidates.length) return;

    const menu = document.createElement('div');
    menu.className = 'floating-menu mention-picker';
    menu.setAttribute('role', 'listbox');
    menu.innerHTML = `<div class="menu-title">Mencionar persona</div>${candidates.map(name => `<button type="button" role="option" data-mention-person="${this.escapeAttr(name)}"><span class="mention-avatar">${this.escapeHtml(this.initials(name).slice(0, 2))}</span><span>${this.escapeHtml(name)}</span></button>`).join('')}<div class="mention-note">Las menciones son locales en New Monday; no envían notificaciones externas.</div>`;
    menu.querySelectorAll('[data-mention-person]').forEach(button => button.addEventListener('click', () => {
      const fresh = this.mentionContext(input) || context;
      this.insertMention(input, button.dataset.mentionPerson, fresh);
      menu.remove();
    }));
    this.positionMenu(menu, input);
  };

  app.bindMentionInput = function bindMentionInput(input) {
    if (!input || input.dataset.mentionsBound === 'true') return;
    input.dataset.mentionsBound = 'true';
    input.addEventListener('input', () => {
      if (this.mentionContext(input)) this.openMentionPicker(input);
      else document.querySelectorAll('.mention-picker').forEach(node => node.remove());
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') document.querySelectorAll('.mention-picker').forEach(node => node.remove());
    });
  };

  app.decorateMentionTextNode = function decorateMentionTextNode(node, regex) {
    const text = node?.nodeValue || '';
    regex.lastIndex = 0;
    if (!regex.test(text)) {
      regex.lastIndex = 0;
      return;
    }
    regex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of text.matchAll(regex)) {
      const index = match.index ?? 0;
      if (index > cursor) fragment.append(document.createTextNode(text.slice(cursor, index)));
      const span = document.createElement('span');
      span.className = 'update-mention';
      span.textContent = match[0];
      span.title = 'Mención local de New Monday';
      fragment.append(span);
      cursor = index + match[0].length;
    }
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  };

  app.decorateMentionText = function decorateMentionText(host) {
    const names = this.mentionCandidates().sort((a, b) => b.length - a.length);
    if (!host || !names.length) return;
    const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`@(${escaped.join('|')})(?=$|[\\s,.;:!?])`, 'gi');
    host.querySelectorAll('.update-body,.update-reply p').forEach(container => {
      container.querySelectorAll('.update-mention').forEach(span => span.replaceWith(document.createTextNode(span.textContent || '')));
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          const parent = node.parentElement;
          if (!parent || parent.closest('.update-mention')) return NodeFilter.FILTER_REJECT;
          if (parent.closest('script,style')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => this.decorateMentionTextNode(node, regex));
      container.dataset.mentionsDecorated = 'true';
    });
  };

  app.renderItemUpdates = async function renderItemUpdatesWithMentions(itemId) {
    await baseRenderItemUpdates(itemId);
    const host = document.getElementById('updates-panel-body');
    if (!host) return;
    host.querySelectorAll('.new-update-form textarea[name="body"],.reply-form input[name="body"],.reply-form textarea[name="body"]').forEach(input => this.bindMentionInput(input));
    this.decorateMentionText(host);
  };
})();
