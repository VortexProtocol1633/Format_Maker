/**
 * FormForge — Form Builder & Document Scanner
 * v6 (folder) · r9 (code) — ES modules refactor
 *
 * Changelog r9:
 *  - Outline tables are customizable (rows/cols/cells), deleted points never
 *    return, and points added in the Add-block modal show in the preview
 *  - Typing a size directly into the Rows/Cols inputs resizes tables
 *  - Autosave to localStorage with a "Saving…/Saved" indicator
 *  - Undo/redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
 *  - Toast notifications; About / From the Creator modal with tabs
 *  - Visual polish: Sora display font, button press feedback, focus rings,
 *    reduced-motion support, version badge
 *
 * Changelog r8:
 *  - Split the monolith script.js into ES modules under js/
 *  - Fixed pdf.js worker setup (workerSrc now resolved from the loaded CDN)
 *  - Scanner heuristics: input-lines win over ALL-CAPS rules, page-number
 *    detection requires a small font for bare digits, footer = last line only,
 *    bold/italic now detected from PDF font metadata
 *  - HTML escaping everywhere user/scanned content is injected (XSS fix)
 *  - Built-in demo templates (templates/DEMO*.json) now appear in the carousel
 *  - Accessibility: focus trap + Esc-to-close on all modals, keyboard
 *    reordering (arrow up/down) in the block list, aria-labels on icon buttons
 *  - CDN reliability: every library tries a backup CDN; failures disable the
 *    affected features and show a warning banner
 *  - Friendly errors when an export/scan library failed to load
 */
import FormState from './state.js';
import DOMRenderer from './renderer.js';
import ModalManager from './modal.js';
import ExportManager from './exporter.js';
import PreviewManager from './preview.js';
import SampleGenerator from './sample.js';
import DocumentScanner from './scanner.js';
import { openOverlay, closeOverlay, trapFocus, showToast } from './util.js';

const OVERLAYS = ['modalOverlay', 'helpModal', 'scanModal', 'pdfPreviewOverlay', 'txtPreviewOverlay', 'docxPreviewOverlay', 'aboutModal', 'coffeeModal'];

const App = {
  init() {
    FormState.init();
    this.setupEventListeners();
    DOMRenderer.render();
    this.applyLibStatus();

    // Demos load asynchronously; re-render the carousel once they arrive
    FormState.loadDemoTemplates().then(() => DOMRenderer.renderCarousel());
  },

  setupEventListeners() {
    // Focus traps + backdrop-click-to-close for every overlay
    OVERLAYS.forEach(id => {
      const overlay = document.getElementById(id);
      if (!overlay) return;
      trapFocus(overlay);
      // Click on the dark backdrop closes the overlay (keeps the add/edit
      // modal protected from accidental data loss — handled separately below)
      if (id !== 'modalOverlay') {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeOverlay(overlay);
        });
      }
    });

    // Esc closes the topmost visible overlay
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      for (let i = OVERLAYS.length - 1; i >= 0; i--) {
        const el = document.getElementById(OVERLAYS[i]);
        if (el && !el.classList.contains('hidden')) {
          if (OVERLAYS[i] === 'modalOverlay') ModalManager.closeModal();
          else closeOverlay(el);
          break;
        }
      }
    });

    document.getElementById('darkToggle').addEventListener('click', () => {
      document.body.classList.toggle('dark');
    });

    document.getElementById('modeBuilder').addEventListener('click', () => {
      if (FormState.isFillupMode) { FormState.isFillupMode = false; DOMRenderer.render(); }
    });
    document.getElementById('modeFillup').addEventListener('click', () => {
      if (!FormState.isFillupMode) { FormState.isFillupMode = true; DOMRenderer.render(); }
    });

    document.getElementById('openAddBlockModal').addEventListener('click', () => ModalManager.openAddModal());
    document.getElementById('editSelectedBtn').addEventListener('click', () => {
      if (FormState.getBlocks().length === 0) return;
      if (FormState.selectedIndex >= FormState.getBlocks().length) FormState.selectedIndex = 0;
      ModalManager.openModal(FormState.selectedIndex);
    });
    document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
      if (FormState.getBlocks().length === 0) return;
      if (FormState.selectedIndex >= FormState.getBlocks().length) FormState.selectedIndex = 0;
      FormState.removeBlock(FormState.selectedIndex);
      DOMRenderer.render();
    });
    document.getElementById('duplicateSelectedBtn').addEventListener('click', () => {
      if (FormState.getBlocks().length === 0) return;
      if (FormState.selectedIndex >= FormState.getBlocks().length) FormState.selectedIndex = 0;
      FormState.duplicateBlock(FormState.selectedIndex);
      DOMRenderer.render();
    });
    document.getElementById('clearAllBtn').addEventListener('click', () => {
      if (confirm('Erase all blocks?')) { FormState.clearAll(); DOMRenderer.render(); }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (FormState.getBlocks().length === 0) return;
        if (FormState.selectedIndex >= FormState.getBlocks().length) FormState.selectedIndex = 0;
        FormState.duplicateBlock(FormState.selectedIndex);
        DOMRenderer.render();
      }
    });

    // Undo / redo: Ctrl+Z (undo), Ctrl+Shift+Z or Ctrl+Y (redo). Skipped while
    // the add/edit modal is open so its live editor never desyncs from state.
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      if (!document.getElementById('modalOverlay').classList.contains('hidden')) return;
      e.preventDefault();
      const changed = isRedo ? FormState.redo() : FormState.undo();
      if (changed) DOMRenderer.render();
    });

    document.getElementById('modalCancelBtn').addEventListener('click', () => ModalManager.closeModal());
    document.getElementById('modalSaveBtn').addEventListener('click', () => ModalManager.saveModal());

    document.getElementById('addTableRowBtn').addEventListener('click', () => {
      const rows = parseInt(document.getElementById('modalTableRows').value) || 3;
      document.getElementById('modalTableRows').value = rows + 1;
      ModalManager.updateTableFromEditor();
    });
    document.getElementById('addTableColBtn').addEventListener('click', () => {
      const cols = parseInt(document.getElementById('modalTableCols').value) || 3;
      document.getElementById('modalTableCols').value = cols + 1;
      ModalManager.updateTableFromEditor();
    });
    document.getElementById('removeTableRowBtn').addEventListener('click', () => {
      const rows = parseInt(document.getElementById('modalTableRows').value) || 3;
      if (rows > 1) { document.getElementById('modalTableRows').value = rows - 1; ModalManager.updateTableFromEditor(); }
    });
    document.getElementById('removeTableColBtn').addEventListener('click', () => {
      const cols = parseInt(document.getElementById('modalTableCols').value) || 3;
      if (cols > 1) { document.getElementById('modalTableCols').value = cols - 1; ModalManager.updateTableFromEditor(); }
    });

    // Typing a value directly into the Rows/Cols inputs must also resize the
    // table (standalone blocks AND tables nested inside outline points) —
    // same as the Add/Remove row/column buttons.
    ['modalTableRows', 'modalTableCols'].forEach(id => {
      const input = document.getElementById(id);
      input.addEventListener('change', () => {
        const val = parseInt(input.value);
        const min = parseInt(input.min) || 1;
        const max = parseInt(input.max) || 1000;
        input.value = String(Math.min(Math.max(val || min, min), max));
        ModalManager.updateTableFromEditor();
      });
    });

    document.getElementById('numberedAddPoint').addEventListener('click', () => ModalManager.addOutlinePoint());
    document.getElementById('numberedAddSub').addEventListener('click', () => ModalManager.addOutlineSubPoint());
    document.getElementById('numberedDelete').addEventListener('click', () => ModalManager.deleteOutlineItem());
    document.getElementById('numberedToggleInput').addEventListener('click', () => ModalManager.toggleInputField());
    document.getElementById('numberedInsertTable').addEventListener('click', () => ModalManager.insertTableInOutline());
    document.getElementById('numberedDuplicatePoint').addEventListener('click', () => ModalManager.duplicateOutlinePoint());

    document.getElementById('modalTypeSelect').addEventListener('change', (e) => {
      ModalManager.onTypeChange(e.target.value);
    });

    document.getElementById('saveTemplateBtn').addEventListener('click', () => this.saveTemplate());
    document.getElementById('loadTemplateBtn').addEventListener('click', () => this.loadTemplate());

    document.getElementById('previewPdfBtn').addEventListener('click', () => PreviewManager.showPDFPreview());
    document.getElementById('previewTxtBtn').addEventListener('click', () => PreviewManager.showTXTPreview());
    document.getElementById('previewDocxBtn').addEventListener('click', () => PreviewManager.showDOCXPreview());

    document.getElementById('downloadPdfFromPreviewBtn').addEventListener('click', () => {
      ExportManager.generatePDF();
      PreviewManager.closePreviews();
    });
    document.getElementById('downloadTxtFromPreviewBtn').addEventListener('click', () => {
      const txt = ExportManager.generateTXT();
      const blob = new Blob([txt], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'form.txt';
      a.click();
      URL.revokeObjectURL(a.href);
      PreviewManager.closePreviews();
    });
    document.getElementById('downloadDocxFromPreviewBtn').addEventListener('click', async () => {
      await ExportManager.generateDOCX();
      PreviewManager.closePreviews();
    });

    document.getElementById('closePdfPreviewBtn').addEventListener('click', () => closeOverlay(document.getElementById('pdfPreviewOverlay')));
    document.getElementById('closeTxtPreviewBtn').addEventListener('click', () => closeOverlay(document.getElementById('txtPreviewOverlay')));
    document.getElementById('closeDocxPreviewBtn').addEventListener('click', () => closeOverlay(document.getElementById('docxPreviewOverlay')));

    document.getElementById('scanDocumentBtn').addEventListener('click', () => openOverlay(document.getElementById('scanModal')));
    document.getElementById('closeScanBtn').addEventListener('click', () => {
      closeOverlay(document.getElementById('scanModal'));
      document.getElementById('scanProgress').style.display = 'none';
      document.getElementById('scanProgressBar').style.width = '0%';
    });

    document.getElementById('helpBtn').addEventListener('click', () => openOverlay(document.getElementById('helpModal')));
    document.getElementById('closeHelpBtn').addEventListener('click', () => closeOverlay(document.getElementById('helpModal')));

    // About / Creator modal (tabbed)
    const switchAboutTab = (tab) => {
      document.querySelectorAll('.about-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      document.querySelectorAll('.about-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
      document.getElementById('aboutModalTitle').innerHTML =
        tab === 'creator'
          ? '<i class="fas fa-user-astronaut" style="color:#8b5cf6;"></i> From the Creator'
          : tab === 'changelog'
            ? '<i class="fas fa-history" style="color:#6366f1;"></i> Changelog'
            : tab === 'credits'
              ? '<i class="fas fa-heart" style="color:#f43f5e;"></i> Credits'
              : '<i class="fas fa-info-circle" style="color:#6366f1;"></i> About FormForge';
    };
    const openAbout = (tab) => { switchAboutTab(tab); openOverlay(document.getElementById('aboutModal')); };
    document.getElementById('aboutBtn').addEventListener('click', () => openAbout('about'));
    document.getElementById('creatorBtn').addEventListener('click', () => openAbout('creator'));
    document.querySelectorAll('.about-tab').forEach(t => t.addEventListener('click', () => switchAboutTab(t.dataset.tab)));
    document.getElementById('closeAboutBtn').addEventListener('click', () => closeOverlay(document.getElementById('aboutModal')));
    // "Buy me a coffee" pops up the donation QR (From The Creator/coffee.png)
    const supportLink = document.getElementById('aboutSupportLink');
    if (supportLink) supportLink.addEventListener('click', (e) => {
      e.preventDefault();
      openOverlay(document.getElementById('coffeeModal'));
    });
    const closeCoffeeBtn = document.getElementById('closeCoffeeBtn');
    if (closeCoffeeBtn) {
      closeCoffeeBtn.addEventListener('click', () => closeOverlay(document.getElementById('coffeeModal')));
    }

    document.getElementById('downloadSamplePdf').addEventListener('click', (e) => { e.preventDefault(); SampleGenerator.generateSamplePDF(); });
    document.getElementById('downloadSampleDocx').addEventListener('click', (e) => { e.preventDefault(); SampleGenerator.generateSampleDOCX(); });

    this.setupScanHandlers();

    // Apply library status when the CDN loader finishes (and at init, if it
    // already finished before the app booted)
    document.addEventListener('formforge:libs-settled', () => this.applyLibStatus());
  },

  setupScanHandlers() {
    const dropZone = document.getElementById('dropZone');
    const scanFileInput = document.getElementById('scanFileInput');
    dropZone.addEventListener('click', () => scanFileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) this.handleFileScan(e.dataTransfer.files[0]);
    });
    scanFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.handleFileScan(e.target.files[0]);
      e.target.value = '';
    });
  },

  async handleFileScan(file) {
    const validTypes = ['pdf', 'docx'];
    const fileType = file.name.split('.').pop().toLowerCase();
    if (!validTypes.includes(fileType)) { showToast('Please upload a PDF or DOCX file.', 'error'); return; }
    const scanProgress = document.getElementById('scanProgress');
    const scanProgressBar = document.getElementById('scanProgressBar');
    const scanStatus = document.getElementById('scanStatus');
    scanProgress.style.display = 'block';
    scanProgressBar.style.width = '10%';
    scanStatus.textContent = 'Loading file...';
    try {
      scanProgressBar.style.width = '30%';
      scanStatus.textContent = 'Scanning document...';
      const scannedBlocks = await DocumentScanner.scan(file);
      scanProgressBar.style.width = '80%';
      scanStatus.textContent = 'Building form...';
      FormState.setBlocks(scannedBlocks);
      DOMRenderer.render();
      scanProgressBar.style.width = '100%';
      scanStatus.textContent = '✅ Form created successfully!';
      setTimeout(() => {
        closeOverlay(document.getElementById('scanModal'));
        scanProgress.style.display = 'none';
        scanProgressBar.style.width = '0%';
      }, 1500);
    } catch (error) {
      scanStatus.textContent = '❌ ' + error.message;
      setTimeout(() => {
        scanProgress.style.display = 'none';
        scanProgressBar.style.width = '0%';
      }, 3000);
    }
  },

  saveTemplate() {
    const name = prompt('Enter template name:');
    if (!name) return;
    FormState.saveTemplate(name, FormState.getBlocks());
    DOMRenderer.renderCarousel();
    showToast(`✓ Template "${name}" saved`, 'success');
  },

  loadTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (Array.isArray(data)) {
            FormState.setBlocks(data);
            DOMRenderer.render();
            showToast('✓ Template loaded', 'success');
          } else showToast('Invalid template file.', 'error');
        } catch (_) { showToast('Invalid template file.', 'error'); }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  /** Disable features whose CDN library failed to load, and show the banner. */
  applyLibStatus() {
    const cdn = window.FormForgeCDN;
    if (!cdn) return;
    const status = cdn.status || {};
    const setDisabled = (id, disabled) => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    };

    if (status.jspdf === 'failed') {
      setDisabled('previewPdfBtn', true);
      const pdfLink = document.getElementById('downloadSamplePdf');
      if (pdfLink) pdfLink.classList.add('is-disabled');
    }
    if (status.docx === 'failed') {
      setDisabled('previewDocxBtn', true);
      const docxLink = document.getElementById('downloadSampleDocx');
      if (docxLink) docxLink.classList.add('is-disabled');
    }
    if (status.pdfjs === 'failed' || status.mammoth === 'failed') {
      setDisabled('scanDocumentBtn', true);
    }

    const banner = document.getElementById('libWarningBanner');
    if (!banner) return;
    const failures = cdn.failures || [];
    if (failures.length > 0) {
      const label = {
        jspdf: 'PDF export', autotable: 'PDF export', pdfjs: 'PDF scanning',
        mammoth: 'DOCX scanning', docx: 'DOCX export', fontAwesome: 'icons'
      };
      const names = failures.map(f => label[f] || f).filter((v, i, a) => a.indexOf(v) === i);
      banner.textContent = `⚠️ Some libraries failed to load (${names.join(', ')}). Check your internet connection and refresh.`;
      banner.classList.remove('hidden');
    }
  }
};

App.init();