/**
 * Format_Maker — Document Settings Editor
 *
 * Lets the user edit FormState.settings: the letterhead lines printed above
 * every page and the page footer. Everything writes straight back through
 * FormState.updateSettings(), which debounces an autosave, so the header in
 * PDF/DOCX exports stays in sync with the preview.
 *
 * All values are built with createElement/textContent (never innerHTML with
 * user data), so long or hostile letterhead text can't inject markup.
 */
import FormState from './state.js';
import { openOverlay, closeOverlay } from './util.js';

const SettingsEditor = {
  overlay: null,
  draft: null,

  init() {
    this.overlay = document.getElementById('settingsModal');
  },

  /** Deep-copy the live settings so Cancel really cancels. */
  open() {
    if (!this.overlay) return;
    this.draft = JSON.parse(JSON.stringify(FormState.settings));
    this.render();
    openOverlay(this.overlay);
  },

  close() {
    if (this.overlay) closeOverlay(this.overlay);
    this.draft = null;
  },

  /** Re-read the draft and repaint both the editor and the live preview. */
  render() {
    this.renderLetterheadList();
    this.renderFooterFields();
    this.renderPreview();
  },

  renderLetterheadList() {
    const list = document.getElementById('letterheadList');
    const empty = document.getElementById('letterheadEmpty');
    if (!list) return;
    list.innerHTML = '';

    const lines = this.draft.letterheadLines || [];
    if (empty) empty.hidden = lines.length > 0;

    lines.forEach((line, idx) => {
      const row = document.createElement('div');
      row.className = 'letterhead-row';

      const handle = document.createElement('i');
      handle.className = 'fas fa-grip-vertical letterhead-grip';
      handle.setAttribute('aria-hidden', 'true');
      row.appendChild(handle);

      const text = document.createElement('input');
      text.type = 'text';
      text.className = 'letterhead-text';
      text.value = line.text || '';
      text.placeholder = 'Letterhead line…';
      text.setAttribute('aria-label', `Letterhead line ${idx + 1} text`);
      text.addEventListener('input', () => {
        this.draft.letterheadLines[idx].text = text.value;
        this.renderPreview();
      });
      row.appendChild(text);

      const align = document.createElement('select');
      align.className = 'letterhead-align';
      align.setAttribute('aria-label', `Letterhead line ${idx + 1} alignment`);
      [['left', '⇤'], ['center', '↔'], ['right', '⇥']].forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        align.appendChild(opt);
      });
      align.value = line.align || 'left';
      align.addEventListener('change', () => {
        this.draft.letterheadLines[idx].align = align.value;
        this.renderPreview();
      });
      row.appendChild(align);

      const size = document.createElement('input');
      size.type = 'number';
      size.className = 'letterhead-size';
      size.min = '6';
      size.max = '24';
      size.value = String(line.fontSize || 10);
      size.setAttribute('aria-label', `Letterhead line ${idx + 1} font size`);
      size.addEventListener('change', () => {
        const val = parseInt(size.value, 10);
        this.draft.letterheadLines[idx].fontSize = Number.isFinite(val)
          ? Math.min(Math.max(val, 6), 24)
          : 10;
        this.renderPreview();
      });
      row.appendChild(size);

      const bold = document.createElement('button');
      bold.type = 'button';
      bold.className = 'letterhead-bold' + (line.bold ? ' active' : '');
      bold.innerHTML = '<i class="fas fa-bold"></i>';
      bold.title = 'Bold';
      bold.setAttribute('aria-label', `Toggle bold on letterhead line ${idx + 1}`);
      bold.addEventListener('click', () => {
        this.draft.letterheadLines[idx].bold = !this.draft.letterheadLines[idx].bold;
        bold.classList.toggle('active', !!this.draft.letterheadLines[idx].bold);
        this.renderPreview();
      });
      row.appendChild(bold);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'letterhead-remove';
      remove.innerHTML = '<i class="fas fa-times"></i>';
      remove.title = 'Remove line';
      remove.setAttribute('aria-label', `Remove letterhead line ${idx + 1}`);
      remove.addEventListener('click', () => {
        this.draft.letterheadLines.splice(idx, 1);
        this.render();
      });
      row.appendChild(remove);

      list.appendChild(row);
    });
  },

  renderFooterFields() {
    const format = document.getElementById('settingsFooterFormat');
    const align = document.getElementById('settingsFooterAlign');
    if (format) {
      format.value = this.draft.footerFormat || '';
      format.addEventListener('input', () => {
        this.draft.footerFormat = format.value;
        this.renderPreview();
      });
    }
    if (align) {
      align.value = this.draft.footerAlign || 'right';
      align.addEventListener('change', () => {
        this.draft.footerAlign = align.value;
        this.renderPreview();
      });
    }
  },

  /** A paper-like preview of the header + footer as they'll be exported. */
  renderPreview() {
    const el = document.getElementById('settingsPreview');
    if (!el) return;
    el.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'settings-preview-head';
    (this.draft.letterheadLines || []).forEach(line => {
      const row = document.createElement('div');
      row.className = 'settings-preview-line';
      row.style.textAlign = line.align || 'left';
      row.style.fontSize = `${(line.fontSize || 10) * 1.1}px`;
      if (line.bold) row.style.fontWeight = '700';
      row.textContent = line.text || '—';
      head.appendChild(row);
    });
    el.appendChild(head);

    if (this.draft.showRule !== false) {
      const rule = document.createElement('div');
      rule.className = 'settings-preview-rule';
      el.appendChild(rule);
    }

    const foot = document.createElement('div');
    foot.className = 'settings-preview-foot';
    foot.style.textAlign = this.draft.footerAlign || 'right';
    // Show a concrete example rather than the raw {page} placeholders.
    foot.textContent = (this.draft.footerFormat || '')
      .replace(/\{page\}/g, '1')
      .replace(/\{totalPages\}/g, '3');
    el.appendChild(foot);
  },

  addLine() {
    if (!Array.isArray(this.draft.letterheadLines)) this.draft.letterheadLines = [];
    this.draft.letterheadLines.push({
      text: '', align: 'center', fontSize: 11, bold: false
    });
    this.render();
  },

  apply() {
    FormState.updateSettings({ letterheadLines: this.draft.letterheadLines });
    this.close();
  },

  reset() {
    FormState.resetSettings();
    this.draft = JSON.parse(JSON.stringify(FormState.settings));
    this.render();
  }
};

export default SettingsEditor;