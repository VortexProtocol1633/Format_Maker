/**
 * FormForge — Preview Manager
 *
 * Opens in-app previews of the generated PDF (a DOM approximation), TXT and
 * DOCX. Uses openOverlay/closeOverlay for accessible focus handling.
 */
import ExportManager from './exporter.js';
import DOMRenderer from './renderer.js';
import { openOverlay, closeOverlay, blockFontCss } from './util.js';

const PreviewManager = {
  pdfPreviewOverlay: document.getElementById('pdfPreviewOverlay'),
  pdfPreviewContent: document.getElementById('pdfPreviewContent'),
  txtPreviewOverlay: document.getElementById('txtPreviewOverlay'),
  txtPreviewContent: document.getElementById('txtPreviewContent'),
  docxPreviewOverlay: document.getElementById('docxPreviewOverlay'),
  docxPreviewContent: document.getElementById('docxPreviewContent'),

  showPDFPreview() {
    const blocks = ExportManager.getExportBlocks();
    this.pdfPreviewContent.innerHTML = '';
    blocks.forEach((block) => {
      const div = document.createElement('div');
      div.className = 'preview-block';
      if (block.indent) div.classList.add(`indent-${block.indent}`);
      let style = blockFontCss(block) + `font-size:${block.fontSize || 16}px;text-align:${block.align || 'left'};`;
      if (block.bold) style += 'font-weight:bold;';
      if (block.italic) style += 'font-style:italic;';
      if (block.underline) style += 'text-decoration:underline;';
      if (block.spacingAfter !== undefined) style += `margin-bottom:${block.spacingAfter}px;`;
      div.style.cssText = style;
      if (block.type === 'table') {
        const data = block.tableData || { rows: 3, cols: 3, cells: {} };
        const table = document.createElement('table');
        table.className = 'preview-table';
        const rows = data.rows || 3;
        const cols = data.cols || 3;
        const cells = data.cells || {};
        for (let r = 0; r < rows; r++) {
          const tr = document.createElement('tr');
          for (let c = 0; c < cols; c++) {
            const td = document.createElement('td');
            td.textContent = cells[`${r}-${c}`] || '';
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        div.appendChild(table);
      } else if (block.type === 'numbered') {
        const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
        const ul = document.createElement('ul');
        ul.className = 'outline-tree';
        DOMRenderer.buildOutlineTree(ul, tree, 0, false, block);
        div.appendChild(ul);
      } else {
        div.textContent = ExportManager.blockToText(block);
      }
      this.pdfPreviewContent.appendChild(div);
    });
    openOverlay(this.pdfPreviewOverlay);
  },

  showTXTPreview() {
    const txt = ExportManager.generateTXT();
    this.txtPreviewContent.textContent = txt;
    openOverlay(this.txtPreviewOverlay);
  },

  showDOCXPreview() {
    const blocks = ExportManager.getExportBlocks();
    this.docxPreviewContent.innerHTML = '';
    blocks.forEach((block) => {
      const div = document.createElement('div');
      div.className = 'preview-block';
      if (block.indent) div.classList.add(`indent-${block.indent}`);
      let style = blockFontCss(block) + `font-size:${block.fontSize || 16}px;text-align:${block.align || 'left'};`;
      if (block.bold) style += 'font-weight:bold;';
      if (block.italic) style += 'font-style:italic;';
      if (block.underline) style += 'text-decoration:underline;';
      if (block.spacingAfter !== undefined) style += `margin-bottom:${block.spacingAfter}px;`;
      div.style.cssText = style;
      if (block.type === 'table') {
        const data = block.tableData || { rows: 3, cols: 3, cells: {} };
        const table = document.createElement('table');
        table.className = 'preview-table';
        const rows = data.rows || 3;
        const cols = data.cols || 3;
        const cells = data.cells || {};
        for (let r = 0; r < rows; r++) {
          const tr = document.createElement('tr');
          for (let c = 0; c < cols; c++) {
            const td = document.createElement('td');
            td.textContent = cells[`${r}-${c}`] || '';
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        div.appendChild(table);
      } else if (block.type === 'numbered') {
        const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
        const ul = document.createElement('ul');
        ul.className = 'outline-tree';
        DOMRenderer.buildOutlineTree(ul, tree, 0, false, block);
        div.appendChild(ul);
      } else {
        div.textContent = ExportManager.blockToText(block);
      }
      this.docxPreviewContent.appendChild(div);
    });
    openOverlay(this.docxPreviewOverlay);
  },

  closePreviews() {
    closeOverlay(this.pdfPreviewOverlay);
    closeOverlay(this.txtPreviewOverlay);
    closeOverlay(this.docxPreviewOverlay);
  }
};

export default PreviewManager;