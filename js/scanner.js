/**
 * FormForge — Document Scanner
 *
 * Parses an uploaded PDF (pdf.js) or DOCX (mammoth) into editable form blocks.
 *
 * Heuristic notes (classifyLine runs in this order):
 *   1. signature-ish lines, page-number-ish lines
 *   2. INPUT-LIKE lines (numbered "1.", ends with ":", contains "_")
 *      — checked BEFORE the ALL-CAPS rules so "NAME: ____" is an input field,
 *        not a heading
 *   3. ALL-CAPS headings / sub-headings
 *   4. font-size based header/sub-heading, first-line header, last-line footer
 */

// Point pdf.js at its worker script. It resolves relative to whichever CDN
// actually delivered pdf.js (so it also works when the fallback CDN is used).
function resolvePdfWorkerSrc() {
  try {
    const script = document.querySelector('script[src*="pdf.min.js"]');
    if (script && script.src) {
      return script.src.replace(/pdf(\.min)?\.js(\?.*)?$/, 'pdf.worker.min.js');
    }
  } catch (_) { /* fall through */ }
  return 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function ensurePdfWorker() {
  try {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc();
    }
  } catch (_) { /* pdf.js unavailable — scan button is disabled by the CDN status banner */ }
}

// pdf.js is loaded asynchronously by the CDN loader (index.html), which races
// this module's evaluation — so the worker path is set at several moments:
//   1. now, in case pdf.js already finished loading
//   2. when the CDN loader reports that all libraries settled
//   3. lazily, right before each PDF parse (see scanPDF below)
//   …and the short poll below as a final safety net.
ensurePdfWorker();
window.addEventListener('formforge:libs-settled', ensurePdfWorker);

// Final safety net: if pdf.js ever arrives without the settle event reaching
// this module (ordering regression, cached copy, etc.), poll briefly until the
// worker path is configured. Stops as soon as it is (or after ~40 s if pdf.js
// never loads, so no timer leaks forever).
let pollAttempts = 0;
const workerPoll = setInterval(() => {
  pollAttempts++;
  const lib = window.pdfjsLib;
  if (lib) {
    ensurePdfWorker();
    if (lib.GlobalWorkerOptions && lib.GlobalWorkerOptions.workerSrc) {
      clearInterval(workerPoll);
    }
  } else if (pollAttempts > 100) {
    clearInterval(workerPoll); // pdf.js is not coming — give up
  }
}, 400);

const DocumentScanner = {
  isFooterOrPageNumber(text, fontSize = 16) {
    const lower = text.toLowerCase();
    const trimmed = text.trim();
    // Bare page numbers ("7") are only treated as page numbers when small
    // (typical footer size) — a standalone large number is probably a list item.
    const smallFont = fontSize <= 12.5;
    return /page\s*\d+/i.test(lower) ||
           /^\d+\s*\/\s*\d+$/.test(trimmed) ||
           /^\d+\s*of\s*\d+$/i.test(lower) ||
           (smallFont && /^\d+$/.test(trimmed));
  },

  extractPDFLines(pdf) {
    return new Promise(async (resolve, reject) => {
      try {
        let allLines = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          // styles maps fontName -> { fontFamily, ... }; used to detect bold/italic
          const styles = textContent.styles || {};
          const linesMap = new Map();
          textContent.items.forEach(item => {
            const y = Math.round(item.transform[5]);
            const fontSize = Math.abs(item.transform[3] || item.height || 16);
            const style = styles[item.fontName] || {};
            const family = style.fontFamily || '';
            if (!linesMap.has(y)) linesMap.set(y, []);
            linesMap.get(y).push({
              text: item.str,
              fontSize,
              bold: /bold|black|heavy|semibold/i.test(family),
              italic: /italic|oblique/i.test(family)
            });
          });
          const sortedYs = [...linesMap.keys()].sort((a, b) => b - a);
          sortedYs.forEach(y => {
            const lineItems = linesMap.get(y);
            const lineText = lineItems.map(item => item.text).join(' ');
            const maxFontSize = Math.max(...lineItems.map(item => item.fontSize), 16);
            allLines.push({
              text: lineText.trim(),
              fontSize: maxFontSize,
              bold: lineItems.some(item => item.bold),
              italic: lineItems.some(item => item.italic)
            });
          });
        }
        resolve(allLines);
      } catch (error) { reject(error); }
    });
  },

  extractDOCXLines(arrayBuffer) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.value, 'text/html');
        const lines = [];
        const elements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div');
        elements.forEach(el => {
          if (el.textContent.trim()) {
            let fontSize = 16;
            const styleAttr = el.getAttribute('style') || '';
            const fontSizeMatch = styleAttr.match(/font-size:\s*(\d+)px/);
            if (fontSizeMatch) fontSize = parseInt(fontSizeMatch[1]);
            else if (el.tagName === 'H1') fontSize = 24;
            else if (el.tagName === 'H2') fontSize = 20;
            else if (el.tagName === 'H3') fontSize = 18;
            else if (el.tagName === 'H4') fontSize = 16;
            else if (el.tagName === 'H5') fontSize = 14;
            else if (el.tagName === 'H6') fontSize = 12;
            lines.push({
              text: el.textContent.trim(),
              fontSize: fontSize,
              bold: el.tagName.startsWith('H') || /font-weight:\s*bold/i.test(styleAttr),
              italic: /font-style:\s*italic/i.test(styleAttr)
            });
          }
        });
        resolve(lines);
      } catch (error) { reject(error); }
    });
  },

  classifyLine(line, index, totalLines) {
    const text = line.text.trim();
    const lower = text.toLowerCase();
    const fontSize = line.fontSize || 16;

    if (lower.includes('signature') || lower.includes('sign')) return 'signature';
    if (this.isFooterOrPageNumber(text, fontSize)) return 'page';

    // Input-like lines win over the heading heuristics (e.g. "NAME: ____")
    if (/^\d+[.)]\s/.test(text) || text.endsWith(':') || text.includes('_')) return 'input';

    // Headings: ALL-CAPS detection, after the input checks above
    if (text === text.toUpperCase() && text.includes('DETAILS') && text.length > 10) return 'heading';
    if (text === text.toUpperCase() && text.length > 5 && text.match(/^[A-Z0-9\s&.'\-()]+$/)) return 'subheading';

    if (fontSize >= 24) return 'header';
    if (fontSize >= 18) return 'subheading';
    if (index === 0) return 'header';
    if (index === totalLines - 1) return 'footer';
    return 'input';
  },

  processScannedLines(lines) {
    const result = [];
    let headerFound = false;
    const totalLines = lines.length;
    lines.forEach((line, idx) => {
      const type = this.classifyLine(line, idx, totalLines);
      if (type === 'header' && !headerFound) headerFound = true;
      let content = line.text.trim();
      if (type === 'input') {
        content = content.replace(/^\d+[.)]\s*/, '').replace(/_+/g, '').replace(/:\s*$/, '').trim();
        if (content.includes(':') && content.split(':').length > 2) {
          const parts = content.split(':').map(p => p.trim()).filter(p => p.length > 0);
          parts.forEach(part => {
            result.push({ type: 'input', content: part, fontSize: Math.min(Math.max(line.fontSize || 16, 12), 32), bold: line.bold || false, italic: line.italic || false, underline: false, indent: 0, align: 'left', spacingAfter: 2 });
          });
          return;
        }
      }
      result.push({ type, content: content || line.text.trim(), fontSize: Math.min(Math.max(line.fontSize || 16, 12), 32), bold: line.bold || false, italic: line.italic || false, underline: false, indent: 0, align: 'left', spacingAfter: 2 });
    });
    if (!headerFound && result.length > 0) {
      result.unshift({ type: 'header', content: 'Form', fontSize: 20, bold: true, italic: false, underline: false, indent: 0, align: 'left', spacingAfter: 2 });
    }
    return result;
  },

  async scanPDF(file) {
    try {
      ensurePdfWorker(); // safety net in case the CDN settled after the listeners above
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const lines = await this.extractPDFLines(pdf);
      return this.processScannedLines(lines);
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error('Failed to parse PDF. Ensure it has selectable text.');
    }
  },

  async scanDOCX(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const lines = await this.extractDOCXLines(arrayBuffer);
      return this.processScannedLines(lines);
    } catch (error) {
      console.error('DOCX parsing error:', error);
      throw new Error("Failed to parse DOCX. Ensure it's valid.");
    }
  },

  async scan(file) {
    const fileType = file.name.split('.').pop().toLowerCase();
    if (fileType === 'pdf') return await this.scanPDF(file);
    if (fileType === 'docx') return await this.scanDOCX(file);
    throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
  }
};

export default DocumentScanner;