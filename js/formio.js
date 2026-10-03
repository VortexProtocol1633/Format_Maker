/**
 * Format_Maker — Form File IO & Printing
 *
 * - exportForm(): download the current form (+ letterhead/footer settings and
 *   fill-up answers) as a versioned .json document.
 * - importForm(): load such a file back, tolerating both the wrapped document
 *   format and a bare array of blocks (the old template format).
 * - printForm(): open a clean, print-only window with just the form — no app
 *   chrome — and hand it to the browser's print dialog.
 *
 * Template files are plain arrays; form files are wrapped objects carrying a
 * version, settings and answers. Both still load, so old exports never break.
 */
import FormState from './state.js';
import DOMRenderer from './renderer.js';
import { showToast, escapeHtml, blockFontCss } from './util.js';

export const FORM_FILE_VERSION = 1;
const FILE_PREFIX = 'format-maker-form';

const FormIO = {
  /** Everything needed to restore a form exactly as it is right now. */
  serialize() {
    return {
      app: 'Format_Maker',
      kind: 'form',
      version: FORM_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      blocks: FormState.getBlocks(),
      settings: FormState.settings,
      answers: FormState.userInputs
    };
  },

  exportForm() {
    const blocks = FormState.getBlocks();
    if (blocks.length === 0) {
      showToast('Add at least one block before exporting.', 'error');
      return;
    }
    const payload = this.serialize();
    const slug = (new Date().toISOString().slice(0, 10));
    this.download(`${FILE_PREFIX}-${slug}.json`, payload);
    showToast('✓ Form exported', 'success');
  },

  /** Trigger a client-side download for any JSON-serializable value. */
  download(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick — revoking synchronously can cancel the
    // download in some browsers before it has started reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** Open a file picker and apply the chosen .json form. */
  importForm() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.applyImport(JSON.parse(String(reader.result)));
        } catch (_) {
          showToast("That file isn't valid JSON.", 'error');
        }
      };
      reader.onerror = () => showToast('Could not read that file.', 'error');
      reader.readAsText(file);
    });
    input.click();
  },

  /**
   * Apply parsed JSON. Accepts the wrapped form document, a `{blocks: [...]}`
   * object, or a bare block array (legacy template files).
   */
  applyImport(data) {
    const blocks = Array.isArray(data) ? data
      : (data && Array.isArray(data.blocks) ? data.blocks : null);
    if (!blocks) {
      showToast('No form blocks found in that file.', 'error');
      return;
    }
    if (!window.confirm(`Load this form? Your current ${FormState.getBlocks().length} block(s) will be replaced.`)) {
      return;
    }
    FormState.setBlocks(blocks);
    if (!Array.isArray(data)) {
      if (data.settings && Array.isArray(data.settings.letterheadLines)) {
        FormState.updateSettings(data.settings);
      }
      if (data.answers && typeof data.answers === 'object') {
        FormState.userInputs = data.answers;
        FormState.persist();
      }
    }
    DOMRenderer.render();
    showToast(`✓ Loaded ${blocks.length} block(s)`, 'success');
  },

  /**
   * Render just the form into a print-only surface inside the current page.
   * A separate window would be blocked by some popup blockers, and printing
   * the live DOM keeps fonts and CSS identical to what's on screen. The
   * surface is hidden by default and only revealed by the @media print rules.
   */
  printForm() {
    const blocks = FormState.getBlocks();
    if (blocks.length === 0) {
      showToast('Add at least one block before printing.', 'error');
      return;
    }

    let surface = document.getElementById('printSurface');
    if (!surface) {
      surface = document.createElement('div');
      surface.id = 'printSurface';
      surface.setAttribute('aria-hidden', 'true');
      document.body.appendChild(surface);
    }
    surface.innerHTML = this.printMarkup();

    // The surface is display:none on screen and display:block only inside
    // @media print, so nothing flashes over the app and there is no state to
    // clean up whether the user prints or cancels.
    window.print();
  },

  /** Build the paper markup: letterhead, blocks, footer. */
  printMarkup() {
    const settings = FormState.settings;
    const head = (settings.letterheadLines || []).map(line => {
      const style = `text-align:${line.align || 'left'};font-size:${line.fontSize || 10}px;`;
      const weight = line.bold ? 'font-weight:700;' : '';
      return `<div style="${style}${weight}">${escapeHtml(line.text || '')}</div>`;
    }).join('');
    const rule = settings.showRule === false ? '' : '<hr class="print-rule">';

    const body = FormState.getBlocks().map(block => this.printBlock(block)).join('');

    const footerText = (settings.footerFormat || '')
      .replace(/\{page\}/g, '1')
      .replace(/\{totalPages\}/g, '1');
    const footer = `<div class="print-footer" style="text-align:${settings.footerAlign || 'right'}">${escapeHtml(footerText)}</div>`;

    return `<div class="print-sheet"><div class="print-letterhead">${head}</div>${rule}<div class="print-body">${body}</div>${footer}</div>`;
  },

  printBlock(block) {
    const style = blockFontCss(block) +
      `font-size:${block.fontSize || 16}px;text-align:${block.align || 'left'};` +
      `margin-bottom:${block.spacingAfter !== undefined ? block.spacingAfter : 2}px;` +
      `margin-left:${(block.indent || 0) * 24}px;` +
      (block.bold ? 'font-weight:700;' : '') +
      (block.italic ? 'font-style:italic;' : '') +
      (block.underline ? 'text-decoration:underline;' : '');

    if (block.type === 'table') {
      return `<table class="print-table" style="${style}"><tbody>${this.printTableRows(block)}</tbody></table>`;
    }
    if (block.type === 'numbered') {
      return `<div style="${style}">${this.printOutline(block.outlineTree || [], 0)}</div>`;
    }
    if (block.type === 'input') {
      // Print input fields as ruled blanks — a fillable form on paper.
      const label = escapeHtml(block.content || '');
      return `<div style="${style}">${label}: <span class="print-blank"></span></div>`;
    }
    if (block.type === 'signature') {
      return `<div style="${style}padding-top:28px;">${escapeHtml(block.content || 'Signature')}: <span class="print-blank"></span></div>`;
    }
    return `<div style="${style}">${escapeHtml(block.content || '')}</div>`;
  },

  printTableRows(block) {
    const data = block.tableData || { rows: 3, cols: 3, cells: {} };
    const rows = data.rows || 3;
    const cols = data.cols || 3;
    const cells = data.cells || {};
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += `<td>${escapeHtml(cells[`${r}-${c}`] || '')}</td>`;
      }
      html += '</tr>';
    }
    return html;
  },

  printOutline(nodes, depth) {
    const indent = 'margin-left:' + depth * 20 + 'px;';
    return nodes.map((node, index) => {
      const symbol = this.outlineSymbol(depth, index);
      let inner;
      if (node.contentType === 'table') {
        inner = `<table class="print-table"><tbody>${this.printTableRows(node)}</tbody></table>`;
      } else if (node.inputField) {
        inner = `${escapeHtml(node.text || '')} <span class="print-blank"></span>`;
      } else {
        inner = escapeHtml(node.text || '');
      }
      let html = `<div style="${indent}">${symbol} ${inner}</div>`;
      if (node.children && node.children.length) {
        html += this.printOutline(node.children, depth + 1);
      }
      return html;
    }).join('');
  },

  /** Mirror of the renderer's numbering scheme (1. / a. / (1) / (a) / i). */
  outlineSymbol(depth, index) {
    if (depth === 0) return `${index + 1}.`;
    if (depth === 1) return `${String.fromCharCode(97 + index)}.`;
    if (depth === 2) return `(${index + 1})`;
    if (depth === 3) return `(${String.fromCharCode(97 + index)})`;
    const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
    const n = index + 1;
    return n <= roman.length ? roman[n - 1] : 'i';
  }
};

export default FormIO;