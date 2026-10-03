/**
 * Format_Maker — Export Manager
 *
 * Converts the block list into TXT, PDF (jsPDF + autotable) and DOCX (docx).
 * All exports include the letterhead and footer settings from FormState.
 * Guards give a friendly error when a CDN library failed to load.
 */
import FormState from './state.js';
import { showToast, blockFontName } from './util.js';

const ExportManager = {
  getExportBlocks() {
    return FormState.getBlocks().map((block, idx) => ({
      ...block,
      userInput: FormState.userInputs[idx] || '',
      label: block.content || block.type
    }));
  },

  // Map a block's font family to a jsPDF built-in face (custom fonts like
  // Poppins/Aptos need embedding, so they fall back to a close standard one).
  pdfFontFor(block) {
    const f = String(blockFontName(block)).toLowerCase();
    if (f.indexOf('times') !== -1 || f === 'georgia' || f === 'garamond') return 'times';
    if (f.indexOf('courier') !== -1 || f === 'consolas' || f === 'monospace') return 'courier';
    return 'helvetica';
  },

  blockToText(block) {
    switch (block.type) {
      case 'input':
        return `${block.label}: ${block.userInput || ''}`;
      case 'table': {
        const data = block.tableData || { rows: 3, cols: 3, cells: {} };
        const rows = data.rows || 3;
        const cols = data.cols || 3;
        const cells = data.cells || {};
        const colWidths = [];
        for (let c = 0; c < cols; c++) {
          let maxLen = 4;
          for (let r = 0; r < rows; r++) {
            const val = cells[`${r}-${c}`] || '';
            maxLen = Math.max(maxLen, val.length);
          }
          colWidths.push(maxLen + 2);
        }
        let txt = '';
        for (let r = 0; r < rows; r++) {
          const row = [];
          for (let c = 0; c < cols; c++) {
            const val = cells[`${r}-${c}`] || '';
            row.push(val.padEnd(colWidths[c]));
          }
          txt += row.join(' ') + '\n';
        }
        return txt;
      }
      case 'numbered': {
        const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
        return this.outlineToText(tree, 0);
      }
      default:
        return block.content || block.type;
    }
  },

  outlineToText(nodes, depth) {
    const symbols = ['1.', 'a.', '(1)', '(a)', 'i'];
    const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
    let result = '';
    nodes.forEach((node, index) => {
      let symbol = symbols[depth] || '•';
      if (depth === 4) {
        const num = index + 1;
        symbol = num <= roman.length ? roman[num-1] : 'i'.repeat(num);
      } else if (depth === 0) {
        symbol = `${index+1}.`;
      } else if (depth === 1) {
        symbol = `${String.fromCharCode(97 + index)}.`;
      } else if (depth === 2) {
        symbol = `(${index+1})`;
      } else if (depth === 3) {
        symbol = `(${String.fromCharCode(97 + index)})`;
      }
      const indent = '  '.repeat(depth);
      if (node.inputField) {
        result += `${indent}${symbol} ${node.text || ''}: ________________________\n`;
      } else if (node.contentType === 'table') {
        const data = node.tableData || { rows: 3, cols: 3, cells: {} };
        const rows = data.rows || 3;
        const cols = data.cols || 3;
        const cells = data.cells || {};
        result += `${indent}${symbol} [Table]\n`;
        for (let r = 0; r < rows; r++) {
          const row = [];
          for (let c = 0; c < cols; c++) {
            row.push(cells[`${r}-${c}`] || '');
          }
          result += `${indent}  ${row.join(' | ')}\n`;
        }
      } else {
        result += `${indent}${symbol} ${node.text || ''}\n`;
      }
      if (node.children && node.children.length > 0 && depth < 4) {
        result += this.outlineToText(node.children, depth + 1);
      }
    });
    return result;
  },

  getOutlineLines(nodes, depth, block) {
    const symbols = ['1.', 'a.', '(1)', '(a)', 'i'];
    const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
    const result = [];
    nodes.forEach((node, index) => {
      let symbol = symbols[depth] || '•';
      if (depth === 4) {
        const num = index + 1;
        symbol = num <= roman.length ? roman[num-1] : 'i'.repeat(num);
      } else if (depth === 0) {
        symbol = `${index+1}.`;
      } else if (depth === 1) {
        symbol = `${String.fromCharCode(97 + index)}.`;
      } else if (depth === 2) {
        symbol = `(${index+1})`;
      } else if (depth === 3) {
        symbol = `(${String.fromCharCode(97 + index)})`;
      }
      if (node.contentType === 'table') {
        result.push({ type: 'table', depth, tableData: node.tableData || { rows: 3, cols: 3, cells: {} }, align: block.align || 'left' });
      } else if (node.inputField) {
        result.push({ type: 'input', depth, text: `${symbol} ${node.text || ''}: ________________________` });
      } else {
        result.push({ type: 'text', depth, text: `${symbol} ${node.text || ''}` });
      }
      if (node.children && node.children.length > 0 && depth < 4) {
        result.push(...this.getOutlineLines(node.children, depth + 1, block));
      }
    });
    return result;
  },

  generatePDF(blocksData = null, filename = 'form.pdf') {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('PDF library failed to load. Check your internet connection and refresh.', 'error');
      return;
    }
    const data = blocksData || this.getExportBlocks();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const margin = 25;
    let y = margin + 22;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentPageNum = 1;
    let totalPages = 1;

    const settings = FormState.settings;

    let tempY = margin + 22;
    settings.letterheadLines.forEach(line => {
      tempY += (line.fontSize || 10) / 2 + 4;
    });
    tempY += 4;
    data.forEach(b => {
      const lines = this.getBlockLines(b, pageWidth - margin * 2);
      tempY += lines.length * ((b.fontSize || 16) / 2 + 4) + 2 + ((b.spacingAfter || 2) / 2);
      if (tempY > pageHeight - margin - 20) {
        totalPages++;
        tempY = margin + 22;
        settings.letterheadLines.forEach(line => {
          tempY += (line.fontSize || 10) / 2 + 4;
        });
        tempY += 4;
      }
    });
    if (totalPages < 1) totalPages = 1;

    const addHeader = () => {
      y = margin + 22;
      settings.letterheadLines.forEach(line => {
        const fs = line.fontSize || 10;
        doc.setFontSize(fs);
        doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
        let x = margin;
        if (line.align === 'center') x = pageWidth / 2;
        else if (line.align === 'right') x = pageWidth - margin;
        doc.text(line.text, x, y, { align: line.align || 'left' });
        y += (fs / 2) + 4;
      });
      doc.setDrawColor(0,0,0);
      doc.setLineWidth(0.5);
      doc.line(margin, y - 2, pageWidth - margin, y - 2);
      y += 4;
    };

    addHeader();

    data.forEach((block) => {
      if (block.type === 'table') {
        const tableData = block.tableData || { rows: 3, cols: 3, cells: {} };
        const rows = tableData.rows || 3;
        const cols = tableData.cols || 3;
        const cells = tableData.cells || {};
        const body = [];
        for (let r = 0; r < rows; r++) {
          const row = [];
          for (let c = 0; c < cols; c++) {
            row.push(cells[`${r}-${c}`] || '');
          }
          body.push(row);
        }
        const fontSize = block.fontSize || 16;
        const indent = (block.indent || 0) * 5;
        const align = block.align || 'left';
        const halign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
        doc.autoTable({
          body: body,
          startY: y,
          margin: { left: margin + indent, right: margin },            styles: { fontSize: fontSize * 0.7, cellPadding: 0.5, halign: halign, font: this.pdfFontFor(block) },
            tableWidth: 'auto',
            columnStyles: {}
        });
        y = doc.lastAutoTable.finalY + 5 + ((block.spacingAfter || 2) / 2);
        return;
      }

      if (block.type === 'numbered') {
        const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
        const lines = this.getOutlineLines(tree, 0, block);
        const indentBase = (block.indent || 0) * 5;
        const align = block.align || 'left';
        lines.forEach(item => {
          if (y > pageHeight - margin - 20) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            const footerText = settings.footerFormat.replace('{page}', currentPageNum).replace('{totalPages}', totalPages);
            const fAlign = settings.footerAlign || 'right';
            let fx = pageWidth - margin;
            if (fAlign === 'center') fx = pageWidth / 2;
            else if (fAlign === 'left') fx = margin;
            doc.text(footerText, fx, pageHeight - margin + 2, { align: fAlign });
            doc.addPage();
            currentPageNum++;
            addHeader();
          }
          const depth = item.depth || 0;
          const indent = indentBase + depth * 5;
          const fontSize = block.fontSize || 16;
          let fontStyle = 'normal';
          if (block.bold && block.italic) fontStyle = 'bolditalic';
          else if (block.bold) fontStyle = 'bold';
          else if (block.italic) fontStyle = 'italic';
          doc.setFontSize(fontSize);
          doc.setFont(this.pdfFontFor(block), fontStyle);

          if (item.type === 'table') {
            const tblData = item.tableData || { rows: 3, cols: 3, cells: {} };
            const rows = tblData.rows || 3;
            const cols = tblData.cols || 3;
            const cells = tblData.cells || {};
            const body = [];
            for (let r = 0; r < rows; r++) {
              const row = [];
              for (let c = 0; c < cols; c++) {
                row.push(cells[`${r}-${c}`] || '');
              }
              body.push(row);
            }
            const halign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
            doc.autoTable({
              body: body,
              startY: y,
              margin: { left: margin + indent, right: margin },
              styles: { fontSize: fontSize * 0.7, cellPadding: 0.5, halign: halign, font: this.pdfFontFor(block) },
              tableWidth: 'auto'
            });
            y = doc.lastAutoTable.finalY + 5 + ((block.spacingAfter || 2) / 2);
            return;
          }

          let text = item.text || '';
          const xPos = margin + indent;
          const maxWidth = pageWidth - margin - xPos - 5;
          const wrapped = doc.splitTextToSize(text, maxWidth);
          wrapped.forEach(line => {
            if (y > pageHeight - margin - 20) {
              doc.setFontSize(10);
              doc.setFont('helvetica', 'italic');
              const footerText = settings.footerFormat.replace('{page}', currentPageNum).replace('{totalPages}', totalPages);
              const fAlign = settings.footerAlign || 'right';
              let fx = pageWidth - margin;
              if (fAlign === 'center') fx = pageWidth / 2;
              else if (fAlign === 'left') fx = margin;
              doc.text(footerText, fx, pageHeight - margin + 2, { align: fAlign });
              doc.addPage();
              currentPageNum++;
              addHeader();
            }
            let drawX = xPos;
            if (align === 'center') drawX = (pageWidth - doc.getTextWidth(line)) / 2;
            else if (align === 'right') drawX = pageWidth - margin - doc.getTextWidth(line);
            else if (align === 'justify') {
              const words = line.split(' ');
              if (words.length > 1) {
                const totalWidth = doc.getTextWidth(line);
                const spaceWidth = doc.getTextWidth(' ');
                const wordWidths = words.map(w => doc.getTextWidth(w));
                const totalWordWidth = wordWidths.reduce((a, b) => a + b, 0);
                const extraSpace = maxWidth - totalWordWidth;
                const spaceCount = words.length - 1;
                const extraPerSpace = extraSpace / spaceCount;
                let cx = xPos;
                words.forEach((w, i) => {
                  doc.text(w, cx, y);
                  if (i < words.length - 1) {
                    cx += doc.getTextWidth(w) + spaceWidth + extraPerSpace;
                  }
                });
                y += (fontSize / 2) + 4;
                return;
              }
              drawX = xPos;
            }
            doc.text(line, drawX, y);
            y += (fontSize / 2) + 4;
          });
          y += ((block.spacingAfter || 2) / 2);
        });
        return;
      }

      const lines = this.getBlockLines(block, pageWidth - margin * 2 - (block.indent || 0) * 5);
      const align = block.align || 'left';

      lines.forEach(line => {
        if (y > pageHeight - margin - 20) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'italic');
          const footerText = settings.footerFormat.replace('{page}', currentPageNum).replace('{totalPages}', totalPages);
          const fAlign = settings.footerAlign || 'right';
          let fx = pageWidth - margin;
          if (fAlign === 'center') fx = pageWidth / 2;
          else if (fAlign === 'left') fx = margin;
          doc.text(footerText, fx, pageHeight - margin + 2, { align: fAlign });
          doc.addPage();
          currentPageNum++;
          addHeader();
        }
        const fontSize = block.fontSize || 16;
        const indent = (block.indent || 0) * 5;
        let xPos = margin + indent;

        let fontStyle = 'normal';
        if (block.bold && block.italic) fontStyle = 'bolditalic';
        else if (block.bold) fontStyle = 'bold';
        else if (block.italic) fontStyle = 'italic';

        doc.setFontSize(fontSize);
        doc.setFont(this.pdfFontFor(block), fontStyle);

        let drawX = xPos;
        if (align === 'center') drawX = (pageWidth - doc.getTextWidth(line)) / 2;
        else if (align === 'right') drawX = pageWidth - margin - doc.getTextWidth(line);
        else if (align === 'justify') {
          const words = line.split(' ');
          if (words.length > 1) {
            const maxWidth = pageWidth - margin - xPos - 5;
            const totalWidth = doc.getTextWidth(line);
            const spaceWidth = doc.getTextWidth(' ');
            const wordWidths = words.map(w => doc.getTextWidth(w));
            const totalWordWidth = wordWidths.reduce((a, b) => a + b, 0);
            const extraSpace = maxWidth - totalWordWidth;
            const spaceCount = words.length - 1;
            const extraPerSpace = extraSpace / spaceCount;
            let cx = xPos;
            words.forEach((w, i) => {
              doc.text(w, cx, y);
              if (i < words.length - 1) {
                cx += doc.getTextWidth(w) + spaceWidth + extraPerSpace;
              }
            });
            if (block.underline) {
              const tw = doc.getTextWidth(line);
              doc.line(xPos, y + 1, xPos + tw, y + 1);
            }
            y += (fontSize / 2) + 4 + ((block.spacingAfter || 2) / 2);
            return;
          }
          drawX = xPos;
        }

        if (block.underline) {
          doc.text(line, drawX, y);
          const tw = doc.getTextWidth(line);
          doc.line(drawX, y + 1, drawX + tw, y + 1);
        } else {
          doc.text(line, drawX, y);
        }
        y += (fontSize / 2) + 4 + ((block.spacingAfter || 2) / 2);
      });
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    const footerText = settings.footerFormat.replace('{page}', currentPageNum).replace('{totalPages}', totalPages);
    const fAlign = settings.footerAlign || 'right';
    let fx = pageWidth - margin;
    if (fAlign === 'center') fx = pageWidth / 2;
    else if (fAlign === 'left') fx = margin;
    doc.text(footerText, fx, pageHeight - margin + 2, { align: fAlign });

    doc.save(filename);
  },

  getBlockLines(block, maxWidth) {
    const { jsPDF } = window.jspdf;
    let text = '';
    if (block.type === 'numbered') {
      const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
      const lines = this.getOutlineLines(tree, 0, block);
      const indentBase = (block.indent || 0) * 5;
      let result = [];
      lines.forEach(item => {
        if (item.type === 'table') return;
        const depth = item.depth || 0;
        const indent = indentBase + depth * 5;
        const prefix = ' '.repeat(indent / 2) + (item.text || '');
        result.push(prefix);
      });
      text = result.join('\n');
    } else if (block.type === 'table') {
      const data = block.tableData || { rows: 3, cols: 3, cells: {} };
      const rows = data.rows || 3;
      const cols = data.cols || 3;
      const cells = data.cells || {};
      const colWidths = [];
      for (let c = 0; c < cols; c++) {
        let maxLen = 4;
        for (let r = 0; r < rows; r++) {
          const val = cells[`${r}-${c}`] || '';
          maxLen = Math.max(maxLen, val.length);
        }
        colWidths.push(maxLen + 2);
      }
      let txt = '';
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
          const val = cells[`${r}-${c}`] || '';
          row.push(val.padEnd(colWidths[c]));
        }
        txt += row.join(' ') + '\n';
      }
      text = txt;
    } else {
      text = this.blockToText(block);
    }
    const doc = new jsPDF('p', 'mm', 'a4');
    const fontSize = block.fontSize || 16;
    doc.setFontSize(fontSize);
    doc.setFont(this.pdfFontFor(block), 'normal');
    return doc.splitTextToSize(text, maxWidth);
  },

  generateTXT(blocksData = null) {
    const data = blocksData || this.getExportBlocks();
    return data.map(b => this.blockToText(b)).join('\n');
  },

  async generateDOCX(blocksData = null, filename = 'form.docx') {
    const data = blocksData || this.getExportBlocks();
    try {
      let docxLib = window.docx || window.Docx;
      if (!docxLib) {
        await this.loadDocxLibrary();
        docxLib = window.docx || window.Docx;
      }
      if (!docxLib || !docxLib.Document || !docxLib.Packer) {
        throw new Error('DOCX library failed to load. Check your internet connection and refresh the page.');
      }
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = docxLib;
      const settings = FormState.settings;

      // One shared alignment map for the whole document — letterhead lines,
      // every block, tables, outline items and the footer paragraph. (It must
      // be declared here at function scope, NOT inside the block loop: the
      // footer below builds after the loop and would hit a ReferenceError.)
      const alignMap = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.BOTH };

      const children = [];

      settings.letterheadLines.forEach(line => {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.text, size: (line.fontSize || 10) * 2, bold: line.bold || false })],
          alignment: alignMap[line.align] || AlignmentType.LEFT,
          spacing: { after: 60 }
        }));
      });
      children.push(new Paragraph({ children: [new TextRun({ text: '__________________________________________________', size: 12 })], spacing: { after: 120 } }));

      data.forEach((block) => {
        const fontSize = (block.fontSize || 16) * 0.75;
        const indent = (block.indent || 0) * 360;
        const alignment = alignMap[block.align] || AlignmentType.LEFT;
        const spacingAfter = (block.spacingAfter || 2) * 20;

        if (block.type === 'table') {
          const tableData = block.tableData || { rows: 3, cols: 3, cells: {} };
          const rows = tableData.rows || 3;
          const cols = tableData.cols || 3;
          const cells = tableData.cells || {};
          const tableRows = [];
          for (let r = 0; r < rows; r++) {
            const rowCells = [];
            for (let c = 0; c < cols; c++) {
              const val = cells[`${r}-${c}`] || '';
              const cellAlign = alignMap[block.align] || AlignmentType.LEFT;
              rowCells.push(new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: val, size: Math.round(fontSize), font: blockFontName(block) })],
                  alignment: cellAlign,
                  spacing: { before: 60, after: 60 }
                })]
              }));
            }
            tableRows.push(new TableRow({ children: rowCells }));
          }
          children.push(new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              insideHorizontal: { style: 'single', size: 1 },
              insideVertical: { style: 'single', size: 1 },
              top: { style: 'single', size: 1 },
              bottom: { style: 'single', size: 1 },
              left: { style: 'single', size: 1 },
              right: { style: 'single', size: 1 }
            }
          }));
          children.push(new Paragraph({ spacing: { after: spacingAfter } }));
          return;
        }

        if (block.type === 'numbered') {
          const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
          const lines = ExportManager.getOutlineLines(tree, 0, block);
          lines.forEach(item => {
            const depth = item.depth || 0;
            const leftIndent = indent + depth * 360;
            if (item.type === 'table') {
              const tblData = item.tableData || { rows: 3, cols: 3, cells: {} };
              const rows = tblData.rows || 3;
              const cols = tblData.cols || 3;
              const cells = tblData.cells || {};
              const tableRows = [];
              for (let r = 0; r < rows; r++) {
                const rowCells = [];
                for (let c = 0; c < cols; c++) {
                  const val = cells[`${r}-${c}`] || '';
                  const cellAlign = alignMap[block.align] || AlignmentType.LEFT;
                rowCells.push(new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: val, size: Math.round(fontSize), font: blockFontName(block) })],
                      alignment: cellAlign,
                      spacing: { before: 60, after: 60 }
                    })]
                  }));
                }
                tableRows.push(new TableRow({ children: rowCells }));
              }
              children.push(new Paragraph({ indent: { left: leftIndent }, spacing: { after: 60 } }));
              children.push(new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  insideHorizontal: { style: 'single', size: 1 },
                  insideVertical: { style: 'single', size: 1 },
                  top: { style: 'single', size: 1 },
                  bottom: { style: 'single', size: 1 },
                  left: { style: 'single', size: 1 },
                  right: { style: 'single', size: 1 }
                }
              }));
              children.push(new Paragraph({ spacing: { after: spacingAfter } }));
              return;
            }
            let text = item.text || '';
            if (item.type === 'input') {
              const parts = text.split(':');
              if (parts.length > 1) {
                const labelText = parts[0] + ':';
                const underlineText = parts.slice(1).join(':') || '________________________';
                children.push(new Paragraph({
                  children: [
                    new TextRun({ text: labelText, size: Math.round(fontSize), bold: block.bold || false, italics: block.italic || false, font: blockFontName(block) }),
                    new TextRun({ text: ' ', size: Math.round(fontSize), font: blockFontName(block) }),
                    new TextRun({ text: underlineText, size: Math.round(fontSize), underline: {}, font: blockFontName(block) })
                  ],
                  indent: { left: leftIndent, hanging: 0 },
                  spacing: { before: 60, after: spacingAfter },
                  alignment: alignment
                }));
                return;
              }
            }
            children.push(new Paragraph({
              children: [new TextRun({ text: text, size: Math.round(fontSize), bold: block.bold || false, italics: block.italic || false, underline: block.underline ? {} : undefined, font: blockFontName(block) })],
              indent: { left: leftIndent, hanging: 0 },
              spacing: { before: 60, after: spacingAfter },
              alignment: alignment
            }));
          });
          return;
        }

        const text = this.blockToText(block);
        const textRun = new TextRun({
          text: text,
          size: Math.round(fontSize),
          bold: block.bold || false,
          italics: block.italic || false,
          underline: block.underline ? {} : undefined,
          font: blockFontName(block)
        });
        children.push(new Paragraph({
          children: [textRun],
          indent: { firstLine: indent, hanging: 0 },
          spacing: { before: 60, after: spacingAfter },
          alignment: alignment
        }));
      });

      const footerAlign = alignMap[settings.footerAlign] || AlignmentType.RIGHT;
      children.push(new Paragraph({
        children: [new TextRun({ text: settings.footerFormat.replace('{page}', '1').replace('{totalPages}', '1'), size: 16, italics: true })],
        alignment: footerAlign,
        spacing: { before: 120, after: 60 }
      }));

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const blob = await Packer.toBlob(doc);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    } catch (error) {
      console.error('DOCX generation error:', error);
      throw new Error(error.message && /failed to load/i.test(error.message)
        ? error.message
        : 'Failed to generate DOCX file.');
    }
  },

  outlineToLinesWithDepth(nodes, depth) {
    const symbols = ['1.', 'a.', '(1)', '(a)', 'i'];
    const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
    const result = [];
    nodes.forEach((node, index) => {
      let symbol = symbols[depth] || '•';
      if (depth === 4) {
        const num = index + 1;
        symbol = num <= roman.length ? roman[num-1] : 'i'.repeat(num);
      } else if (depth === 0) {
        symbol = `${index+1}.`;
      } else if (depth === 1) {
        symbol = `${String.fromCharCode(97 + index)}.`;
      } else if (depth === 2) {
        symbol = `(${index+1})`;
      } else if (depth === 3) {
        symbol = `(${String.fromCharCode(97 + index)})`;
      }
      const text = `${symbol} ${node.text || ''}`;
      result.push({ text, depth });
      if (node.children && node.children.length > 0 && depth < 4) {
        result.push(...this.outlineToLinesWithDepth(node.children, depth + 1));
      }
    });
    return result;
  },

  loadDocxLibrary() {
    return new Promise((resolve, reject) => {
      if (window.docx || window.Docx) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/docx@8.2.2/build/index.umd.min.js';
      script.onload = () => setTimeout(resolve, 200);
      script.onerror = () => reject(new Error('Failed to load DOCX library'));
      document.head.appendChild(script);
    });
  }
};

export default ExportManager;