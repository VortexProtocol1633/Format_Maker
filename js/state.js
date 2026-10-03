/**
 * Format_Maker — Form Builder & Document Scanner
 * v6 (folder) · r8 (code) — ES modules refactor
 *
 * Module: FormState (state management)
 *
 * Holds the form block list, selection, fill-up inputs and templates.
 * Also loads the built-in demo templates (templates/DEMO*.json) into the
 * carousel. Demos are fetched at runtime, so they simply don't appear when
 * the app is opened without a local server (file://).
 */

const FormState = {
  blocks: [],
  selectedIndex: 0,
  editingIndex: null,
  isFillupMode: false,
  userInputs: {},
  savedTemplates: [],
  demoTemplates: [],
  // Undo/redo history — snapshots of { blocks, userInputs }
  undoStack: [],
  redoStack: [],
  _saveTimer: null,
  _indTimer: null,
  AUTOSAVE_KEY: 'formatmaker_current',
  TEMPLATES_KEY: 'formatmaker_templates',
  PREFS_KEY: 'formatmaker_prefs',
  // Keys written by the pre-rename "FormForge" build. Read once so an
  // existing user's autosaved form and saved templates survive the rename.
  LEGACY_KEYS: { current: 'formforge_current', templates: 'formforge_templates' },

  // Document settings for letterhead/footer
  settings: {
    letterheadLines: [
      { text: 'UNCLASSIFIED', align: 'left', fontSize: 10, bold: false },
      { text: 'DEPARTMENT OF DEFENSE', align: 'center', fontSize: 12, bold: true },
      { text: 'Format_Maker · Official Correspondence', align: 'center', fontSize: 10, bold: false }
    ],
    footerFormat: 'Page {page} of {totalPages}',
    footerAlign: 'right'
  },

  // User preferences (theme, accent, active tab) — persisted separately from
  // the document so changing a preference never dirties the autosave history.
  prefs: {
    theme: 'light',      // 'light' | 'dark' | 'system'
    accent: 'indigo',    // see ACCENTS below
    activeTab: 'builder'
  },

  // Accent presets. The CSS defines an --accent-* custom-property set per
  // value; switching only rewrites one attribute on <html>.
  ACCENTS: ['indigo', 'violet', 'emerald', 'rose', 'amber'],

  init() {
    this.loadPrefs();
    this.blocks = this.restoreCurrent() || this.getDefaultBlocks();
    this.loadSavedTemplates();
  },

  /** Read a localStorage key, transparently falling back to the legacy one. */
  readStored(key, legacyKey) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) { return null; }
    if (raw !== null) return raw;
    if (!legacyKey) return null;
    try {
      raw = localStorage.getItem(legacyKey);
      if (raw !== null) {
        // Copy forward once, then drop the old key so the rename is complete.
        localStorage.setItem(key, raw);
        localStorage.removeItem(legacyKey);
      }
    } catch (_) { /* private mode / storage disabled */ }
    return raw;
  },

  loadPrefs() {
    try {
      const raw = localStorage.getItem(this.PREFS_KEY);
      if (raw) this.prefs = Object.assign({}, this.prefs, JSON.parse(raw));
    } catch (_) { /* keep defaults */ }
  },

  savePrefs() {
    try { localStorage.setItem(this.PREFS_KEY, JSON.stringify(this.prefs)); }
    catch (_) { /* storage disabled */ }
  },

  /** Load the last autosaved form (blocks + fill-up values), if any. */
  restoreCurrent() {
    try {
      const raw = this.readStored(this.AUTOSAVE_KEY, this.LEGACY_KEYS.current);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.blocks)) return null;
      this.userInputs = data.userInputs || {};
      if (data.settings && Array.isArray(data.settings.letterheadLines)) {
        this.settings = Object.assign({}, this.settings, data.settings);
      }
      return data.blocks;
    } catch (_) { return null; }
  },

  /** Reset letterhead/footer settings back to the shipped defaults. */
  resetSettings() {
    this.settings = {
      letterheadLines: [
        { text: 'UNCLASSIFIED', align: 'left', fontSize: 10, bold: false },
        { text: 'DEPARTMENT OF DEFENSE', align: 'center', fontSize: 12, bold: true },
        { text: 'Format_Maker · Official Correspondence', align: 'center', fontSize: 10, bold: false }
      ],
      footerFormat: 'Page {page} of {totalPages}',
      footerAlign: 'right'
    };
    this.persist();
  },

  /** Save letterhead/footer settings and repaint the header preview. */
  updateSettings(patch) {
    Object.assign(this.settings, patch);
    this.persist();
  },

  /** Debounced autosave of the current form to localStorage. */
  persist() {
    const ind = document.getElementById('saveIndicator');
    if (ind) {
      ind.classList.remove('saved');
      ind.classList.add('saving');
      ind.innerHTML = '<i class="fas fa-cloud"></i> Saving…';
    }
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(this.AUTOSAVE_KEY, JSON.stringify({
          blocks: this.blocks,
          userInputs: this.userInputs,
          settings: this.settings
        }));
      } catch (_) { /* storage full / private mode — ignore */ }
      if (ind) {
        ind.classList.remove('saving');
        ind.classList.add('saved');
        ind.innerHTML = '<i class="fas fa-cloud"></i> Saved';
        clearTimeout(this._indTimer);
        this._indTimer = setTimeout(() => ind.classList.remove('saved'), 1600);
      }
    }, 400);
  },

  /** Snapshot the current state before a mutating operation. */
  pushHistory() {
    this.undoStack.push(JSON.stringify({ blocks: this.blocks, userInputs: this.userInputs }));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  },

  undo() {
    if (this.undoStack.length === 0) return false;
    const snap = JSON.parse(this.undoStack.pop());
    this.redoStack.push(JSON.stringify({ blocks: this.blocks, userInputs: this.userInputs }));
    this.restoreSnapshot(snap);
    return true;
  },

  redo() {
    if (this.redoStack.length === 0) return false;
    const snap = JSON.parse(this.redoStack.pop());
    this.undoStack.push(JSON.stringify({ blocks: this.blocks, userInputs: this.userInputs }));
    this.restoreSnapshot(snap);
    return true;
  },

  restoreSnapshot(snap) {
    this.blocks = snap.blocks;
    this.userInputs = snap.userInputs || {};
    if (this.selectedIndex >= this.blocks.length) {
      this.selectedIndex = Math.max(0, this.blocks.length - 1);
    }
    this.persist();
  },

  getDefaultBlocks() {
    return [
      { type: 'header', content: 'My Form', fontSize: 18, bold: true, italic: false, underline: false, indent: 0, align: 'left', spacingAfter: 2 },
      { type: 'input', content: 'Full name', fontSize: 16, bold: false, italic: false, underline: false, indent: 0, align: 'left', spacingAfter: 2 },
      { type: 'input', content: 'Email', fontSize: 16, bold: false, italic: false, underline: false, indent: 0, align: 'left', spacingAfter: 2 },
      { type: 'signature', content: 'Signature', fontSize: 16, bold: false, italic: false, underline: false, indent: 0, align: 'left', spacingAfter: 2 },
      { type: 'footer', content: 'Page 1', fontSize: 14, bold: false, italic: false, underline: false, indent: 0, align: 'left', spacingAfter: 2 },
    ];
  },

  getBlocks() { return this.blocks; },

  setBlocks(blocks) {
    this.pushHistory();
    this.blocks = blocks;
    this.selectedIndex = 0;
    this.userInputs = {};
    this.persist();
  },

  addBlock(block) {
    this.pushHistory();
    this.blocks.push(block);
    this.selectedIndex = this.blocks.length - 1;
    this.persist();
  },

  updateBlock(index, block) {
    if (index >= 0 && index < this.blocks.length) {
      this.pushHistory();
      this.blocks[index] = block;
      this.persist();
    }
  },

  removeBlock(index) {
    if (index >= 0 && index < this.blocks.length) {
      this.pushHistory();
      this.blocks.splice(index, 1);
      if (this.selectedIndex >= this.blocks.length) {
        this.selectedIndex = Math.max(0, this.blocks.length - 1);
      }
      this.persist();
    }
  },

  duplicateBlock(index) {
    if (index < 0 || index >= this.blocks.length) return;
    this.pushHistory();
    const original = this.blocks[index];
    const clone = structuredClone(original);
    this.blocks.splice(index + 1, 0, clone);
    this.selectedIndex = index + 1;
    this.persist();
  },

  moveBlock(fromIndex, toIndex) {
    if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
      this.pushHistory();
      const [moved] = this.blocks.splice(fromIndex, 1);
      this.blocks.splice(toIndex, 0, moved);
      this.selectedIndex = toIndex;
      this.persist();
    }
  },

  clearAll() {
    this.pushHistory();
    this.blocks = [];
    this.selectedIndex = 0;
    this.userInputs = {};
    this.persist();
  },

  loadSavedTemplates() {
    try {
      const data = this.readStored(this.TEMPLATES_KEY, this.LEGACY_KEYS.templates);
      const parsed = data ? JSON.parse(data) : [];
      this.savedTemplates = Array.isArray(parsed) ? parsed : [];
    } catch (_) { this.savedTemplates = []; }
  },

  saveTemplate(name, blocks) {
    const entry = {
      name,
      blocks: JSON.parse(JSON.stringify(blocks)),
      settings: JSON.parse(JSON.stringify(this.settings)),
      date: Date.now()
    };
    this.savedTemplates.push(entry);
    this.persistTemplates();
  },

  deleteTemplate(name) {
    this.savedTemplates = this.savedTemplates.filter(t => t.name !== name);
    this.persistTemplates();
  },

  persistTemplates() {
    try { localStorage.setItem(this.TEMPLATES_KEY, JSON.stringify(this.savedTemplates)); }
    catch (_) { /* storage full / private mode */ }
  },

  /** Fetch the built-in demo templates so they appear in the carousel. */
  async loadDemoTemplates() {
    const candidates = [
      { file: 'templates/DEMO1.json', name: 'OFFR Data (Demo)' },
      { file: 'templates/DEMO2.json', name: 'Simple Form (Demo)' }
    ];
    const loaded = [];
    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate.file, { cache: 'no-store' });
        if (!res.ok) continue;
        const blocks = await res.json();
        if (Array.isArray(blocks)) loaded.push({ name: candidate.name, blocks });
      } catch (_) {
        // e.g. app opened via file:// — demos are skipped silently
      }
    }
    this.demoTemplates = loaded;
  }
};

export default FormState;