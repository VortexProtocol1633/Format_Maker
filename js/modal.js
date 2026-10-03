/**
 * Format_Maker — Modal Manager
 *
 * Add/edit block modal: block type, styling options, the in-modal table
 * editor (resize rows/columns, edit cells) and the numbered-outline editor
 * (add/delete/duplicate points, toggle input fields, insert tables).
 * Uses openOverlay/closeOverlay for accessible focus handling.
 *
 * v6 r9 fixes:
 *  - Adding a NEW numbered/outline block now edits a fresh draft tree
 *    (draftTree) instead of stale DOM from a previous session, and the draft
 *    is saved — points typed/added in the Add modal now appear in the
 *    preview and exports (fixes "first point not shown in preview").
 *  - Deleting the last outline point really removes it — no ghost "cleared"
 *    item is left behind, so a new outline never inherits old points.
 *  - Tables inserted into an outline node are customizable: selecting or
 *    inserting a table node reveals the table editor (rows/cols/cells) and
 *    changes are written back to the node (fixes fixed "3x3, cannot
 *    customize" tables).
 */
import FormState from './state.js';
import DOMRenderer from './renderer.js';
import { openOverlay, closeOverlay, FONT_OPTIONS, DEFAULT_FONT } from './util.js';

const ModalManager = {
  modalOverlay: document.getElementById('modalOverlay'),
  modalTypeSelect: document.getElementById('modalTypeSelect'),
  modalContentInput: document.getElementById('modalContentInput'),
  modalFontSize: document.getElementById('modalFontSize'),
  modalFont: document.getElementById('modalFont'),
  modalIndent: document.getElementById('modalIndent'),
  modalAlign: document.getElementById('modalAlign'),
  modalSpacingAfter: document.getElementById('modalSpacingAfter'),
  modalBold: document.getElementById('modalBold'),
  modalItalic: document.getElementById('modalItalic'),
  modalUnderline: document.getElementById('modalUnderline'),
  modalTitle: document.getElementById('modalTitle'),
  tableConfig: document.getElementById('tableConfig'),
  tableEditor: document.getElementById('tableEditor'),
  numberedConfig: document.getElementById('numberedConfig'),
  numberedTreeEditor: document.getElementById('numberedTreeEditor'),
  numberedFeedback: document.getElementById('numberedFeedback'),
  editingBlock: null,
  selectedPath: null,
  // Outline tree used while ADDING a new block (editingBlock is null).
  draftTree: null,
  // The outline node currently being edited as a table (rows/cols/cells).
  editingTableNode: null,
  tableNodePath: null,

  openModal(index) {
    const blocks = FormState.getBlocks();
    const block = blocks[index];
    if (!block) return;

    FormState.editingIndex = index;
    this.editingBlock = block;
    this.ensureFontOptions();
    this.draftTree = null;
    this.editingTableNode = null;
    this.tableNodePath = null;
    this.modalTitle.textContent = `Edit ${DOMRenderer.getTypeLabel(block.type)}`;

    this.modalTypeSelect.innerHTML = '';
    ['input', 'heading', 'subheading', 'subsubheading', 'signature', 'header', 'footer', 'page', 'table', 'numbered'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = DOMRenderer.getTypeLabel(t);
      if (t === block.type) opt.selected = true;
      this.modalTypeSelect.appendChild(opt);
    });

    this.modalContentInput.value = block.content || '';
    this.modalFontSize.value = block.fontSize || 16;
    this.modalFont.value = block.fontFamily || DEFAULT_FONT;
    this.modalIndent.value = block.indent || 0;
    this.modalAlign.value = block.align || 'left';
    this.modalSpacingAfter.value = block.spacingAfter !== undefined ? block.spacingAfter : 2;
    this.modalBold.checked = !!block.bold;
    this.modalItalic.checked = !!block.italic;
    this.modalUnderline.checked = !!block.underline;

    if (block.type === 'table') {
      this.tableConfig.style.display = 'block';
      if (!block.tableData) block.tableData = { rows: 3, cols: 3, cells: {} };
      const data = block.tableData;
      document.getElementById('modalTableRows').value = data.rows || 3;
      document.getElementById('modalTableCols').value = data.cols || 3;
      this.renderTableEditor(data);
    } else {
      this.tableConfig.style.display = 'none';
    }

    if (block.type === 'numbered') {
      this.numberedConfig.style.display = 'block';
      if (!block.outlineTree) block.outlineTree = [{ text: 'Item 1', children: [] }];
      this.renderOutlineEditor(block.outlineTree);
    } else {
      this.numberedConfig.style.display = 'none';
    }

    openOverlay(this.modalOverlay);
    this.selectedPath = null;
    this.clearFeedback();
  },

  openAddModal() {
    FormState.editingIndex = null;
    this.editingBlock = null;
    this.ensureFontOptions();
    this.draftTree = null;
    this.editingTableNode = null;
    this.tableNodePath = null;
    this.modalTitle.textContent = 'Add new block';
    this.modalTypeSelect.value = 'input';
    this.modalContentInput.value = '';
    this.modalFontSize.value = 16;
    this.modalFont.value = DEFAULT_FONT;
    this.modalIndent.value = 0;
    this.modalAlign.value = 'left';
    this.modalSpacingAfter.value = 2;
    this.modalBold.checked = false;
    this.modalItalic.checked = false;
    this.modalUnderline.checked = false;
    this.tableConfig.style.display = 'none';
    this.numberedConfig.style.display = 'none';
    openOverlay(this.modalOverlay);
    this.selectedPath = null;
    this.clearFeedback();
  },

  closeModal() {
    closeOverlay(this.modalOverlay);
    FormState.editingIndex = null;
    this.editingBlock = null;
    this.draftTree = null;
    // Outline edits apply live to the block, so persist even on Cancel.
    FormState.persist();
  },

  /** Fill the font dropdown once (options render in their own font). */
  ensureFontOptions() {
    if (this.modalFont.options.length > 0) return;
    FONT_OPTIONS.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      opt.style.fontFamily = `"${f.value}", sans-serif`;
      this.modalFont.appendChild(opt);
    });
  },

  /** Called when the modal's block-type dropdown changes. */
  onTypeChange(type) {
    this.tableConfig.style.display = type === 'table' ? 'block' : 'none';
    this.numberedConfig.style.display = type === 'numbered' ? 'block' : 'none';
    if (type === 'numbered') {
      // Render the block's live tree, or a fresh draft when adding a new
      // block / converting a block — never stale DOM from a previous session.
      this.renderOutlineEditor(this.getActiveTree());
    } else {
      this.clearTableSelection();
    }
  },

  saveModal() {
    const type = this.modalTypeSelect.value;
    const newBlock = {
      type: type,
      content: this.modalContentInput.value || DOMRenderer.getTypeLabel(type),
      fontSize: parseInt(this.modalFontSize.value) || 16,
      fontFamily: this.modalFont.value || DEFAULT_FONT,
      indent: parseInt(this.modalIndent.value) || 0,
      align: this.modalAlign.value || 'left',
      spacingAfter: parseInt(this.modalSpacingAfter.value) || 2,
      bold: this.modalBold.checked,
      italic: this.modalItalic.checked,
      underline: this.modalUnderline.checked
    };

    if (type === 'table') {
      const rows = parseInt(document.getElementById('modalTableRows').value) || 3;
      const cols = parseInt(document.getElementById('modalTableCols').value) || 3;
      const cells = {};
      const editor = this.tableEditor;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const input = editor.querySelector(`[data-cell="${r}-${c}"]`);
          if (input) cells[`${r}-${c}`] = input.value;
        }
      }
      newBlock.tableData = { rows, cols, cells };
    }

    if (type === 'numbered') {
      newBlock.outlineTree = this.getOutlineTreeFromEditor();
    }

    if (FormState.editingIndex !== null) {
      FormState.updateBlock(FormState.editingIndex, newBlock);
    } else {
      FormState.addBlock(newBlock);
    }

    this.closeModal();
    DOMRenderer.render();
  },

  renderTableEditor(data) {
    const editor = this.tableEditor;
    const rows = data.rows || 3;
    const cols = data.cols || 3;
    const cells = data.cells || {};
    editor.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.cell = `${r}-${c}`;
        input.value = cells[`${r}-${c}`] || '';
        input.style.cssText = 'width:100%; border:none; background:transparent; padding:0.2rem;';
        // Live-write cell content into the table target (a standalone table
        // block or an outline table node) so saves keep the typed data.
        input.addEventListener('input', () => {
          const target = this.getTableTarget();
          if (target) {
            if (!target.tableData) target.tableData = { rows, cols, cells: {} };
            target.tableData.cells[`${r}-${c}`] = input.value;
          }
        });
        td.appendChild(input);
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    editor.appendChild(frag);
    document.getElementById('modalTableRows').value = rows;
    document.getElementById('modalTableCols').value = cols;
  },

  updateTableFromEditor() {
    const rows = parseInt(document.getElementById('modalTableRows').value) || 3;
    const cols = parseInt(document.getElementById('modalTableCols').value) || 3;
    const cells = {};
    const editor = this.tableEditor;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const input = editor.querySelector(`[data-cell="${r}-${c}"]`);
        if (input) cells[`${r}-${c}`] = input.value;
      }
    }
    const target = this.getTableTarget();
    if (target) {
      if (!target.tableData) target.tableData = { rows, cols, cells: {} };
      target.tableData.rows = rows;
      target.tableData.cols = cols;
      target.tableData.cells = cells;
      // Outline table nodes carry a human-readable label of their size.
      if (target.contentType === 'table') target.text = `Table ${rows}x${cols}`;
    }
    this.renderTableEditor({ rows, cols, cells });
    // If an outline table node is being edited, refresh its label in the tree
    // and keep the table editor open on the same node.
    if (this.editingTableNode) {
      const node = this.editingTableNode;
      const path = this.tableNodePath;
      this.renderOutlineEditor(this.getActiveTree());
      if (path) this.selectTableNode(node, path);
    }
  },

  /** Where the visible table editor writes to: an outline table node first,
   *  otherwise a standalone table block being edited. */
  getTableTarget() {
    if (this.editingTableNode) return this.editingTableNode;
    if (this.editingBlock && this.editingBlock.type === 'table') return this.editingBlock;
    return null;
  },

  renderOutlineEditor(tree) {
    const container = this.numberedTreeEditor;
    container.innerHTML = '';
    if (!tree || tree.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = 'opacity:0.5; font-size:0.8rem; padding:0.3rem 0;';
      hint.textContent = 'No points yet — use "Add point" to start.';
      container.appendChild(hint);
      this.selectedPath = null;
      this.clearTableSelection();
      this.clearFeedback();
      return;
    }
    this.buildOutlineEditorUI(container, tree, 0, []);
    this.selectedPath = null;
    this.clearTableSelection();
    this.clearFeedback();
  },

  buildOutlineEditorUI(parent, nodes, depth, pathSoFar) {
    const symbols = ['1.', 'a.', '(1)', '(a)', 'i'];
    const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
    nodes.forEach((node, index) => {
      const currentPath = [...pathSoFar, index];
      const li = document.createElement('li');
      li.className = `depth-${depth}`;
      li.dataset.path = currentPath.join(',');

      const label = document.createElement('span');
      label.className = 'num-label';
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
      label.textContent = symbol + ' ';
      li.appendChild(label);

      if (node.contentType === 'table') {
        const tableInfo = document.createElement('span');
        tableInfo.textContent = ` [Table ${node.tableData?.rows || 3}x${node.tableData?.cols || 3}] `;
        tableInfo.style.color = '#6366f1';
        tableInfo.style.fontWeight = 'bold';
        li.appendChild(tableInfo);
        li.dataset.hasTable = 'true';
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'item-editor';
        input.value = node.text || '';
        input.dataset.path = currentPath.join(',');
        input.addEventListener('input', () => {
          node.text = input.value;
        });
        li.appendChild(input);
      }

      li.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedPath = currentPath;
        this.numberedTreeEditor.querySelectorAll('li').forEach(l => l.style.background = 'transparent');
        li.style.background = 'rgba(99,102,241,0.1)';
        if (node.contentType === 'table') {
          this.selectTableNode(node, currentPath);
        } else {
          this.clearTableSelection();
        }
        this.clearFeedback();
      });

      parent.appendChild(li);

      if (node.children && node.children.length > 0 && depth < 4) {
        const subUl = document.createElement('ul');
        subUl.style.listStyle = 'none';
        subUl.style.paddingLeft = '0.5rem';
        this.buildOutlineEditorUI(subUl, node.children, depth + 1, currentPath);
        li.appendChild(subUl);
      }
    });
  },

  /** Show the table editor configured for an outline table node. */
  selectTableNode(node, path) {
    this.editingTableNode = node;
    this.tableNodePath = path;
    this.tableConfig.style.display = 'block';
    this.renderTableEditor(node.tableData || { rows: 3, cols: 3, cells: {} });
    const li = this.numberedTreeEditor.querySelector(`li[data-path="${path.join(',')}"]`);
    if (li) {
      this.numberedTreeEditor.querySelectorAll('li').forEach(l => l.style.background = 'transparent');
      li.style.background = 'rgba(99,102,241,0.1)';
    }
    this.clearFeedback();
  },

  clearTableSelection() {
    this.editingTableNode = null;
    this.tableNodePath = null;
    if (this.modalTypeSelect.value !== 'table') {
      this.tableConfig.style.display = 'none';
    }
  },

  getNodeByPath(tree, path) {
    let current = tree;
    for (let i = 0; i < path.length; i++) {
      if (!current || !Array.isArray(current) || path[i] >= current.length) return null;
      const node = current[path[i]];
      if (i === path.length - 1) return node;
      if (!node || !node.children) return null;
      current = node.children;
    }
    return null;
  },

  getParentByPath(tree, path) {
    if (path.length <= 1) return { parent: tree, index: path[0] };
    const parentPath = path.slice(0, -1);
    const parentNode = this.getNodeByPath(tree, parentPath);
    if (parentNode && parentNode.children) {
      return { parent: parentNode.children, index: path[path.length - 1] };
    }
    return null;
  },

  /** The outline tree being edited: the block's live tree, or a fresh draft
   *  used while adding a new block (created on first use). */
  getActiveTree() {
    if (this.editingBlock && Array.isArray(this.editingBlock.outlineTree)) {
      return this.editingBlock.outlineTree;
    }
    if (!this.draftTree) this.draftTree = [{ text: 'Item 1', children: [] }];
    return this.draftTree;
  },

  getOutlineTreeFromEditor() {
    return this.editingBlock?.outlineTree || this.draftTree || [{ text: 'Item 1', children: [] }];
  },

  clearFeedback() {
    this.numberedFeedback.textContent = '';
    this.numberedFeedback.style.opacity = '0';
  },

  showFeedback(msg, isError = false) {
    this.numberedFeedback.textContent = msg;
    this.numberedFeedback.style.color = isError ? '#ef4444' : '#6366f1';
    this.numberedFeedback.style.opacity = '1';
    clearTimeout(this._feedbackTimer);
    this._feedbackTimer = setTimeout(() => {
      this.clearFeedback();
    }, 3000);
  },

  addOutlinePoint() {
    const tree = this.getActiveTree();
    FormState.pushHistory();
    tree.push({ text: 'New point', children: [] });
    this.renderOutlineEditor(tree);
    this.showFeedback('✓ Point added');
  },

  addOutlineSubPoint() {
    if (this.selectedPath === null) {
      this.showFeedback('Select a point first to add a sub-point', true);
      return;
    }
    const path = this.selectedPath;
    if (path.length >= 5) {
      this.showFeedback('Maximum 5 levels', true);
      return;
    }
    const tree = this.getActiveTree();
    const node = this.getNodeByPath(tree, path);
    if (node) {
      FormState.pushHistory();
      if (!node.children) node.children = [];
      node.children.push({ text: 'New sub-point', children: [] });
      this.renderOutlineEditor(tree);
      this.showFeedback('✓ Sub-point added');
    }
  },

  deleteOutlineItem() {
    if (this.selectedPath === null) {
      this.showFeedback('Select a point to delete', true);
      return;
    }
    const tree = this.getActiveTree();
    const path = this.selectedPath;
    const parent = this.getParentByPath(tree, path);
    if (!parent) return;

    // Truly remove the node — deleting the last point empties the tree, so
    // no ghost "cleared" item lingers in later previews/outlines.
    FormState.pushHistory();
    parent.parent.splice(parent.index, 1);
    this.selectedPath = null;
    this.renderOutlineEditor(tree);
    this.showFeedback('✓ Point deleted');
  },

  toggleInputField() {
    if (this.selectedPath === null) {
      this.showFeedback('Select a point first', true);
      return;
    }
    const tree = this.getActiveTree();
    const node = this.getNodeByPath(tree, this.selectedPath);
    if (node) {
      if (node.contentType === 'table') {
        this.showFeedback('Cannot add input to a table node', true);
        return;
      }
      FormState.pushHistory();
      node.inputField = !node.inputField;
      if (node.inputField && node.contentType) delete node.contentType;
      this.renderOutlineEditor(tree);
      this.showFeedback(node.inputField ? '✓ Input field enabled' : '✓ Input field disabled');
    }
  },

  insertTableInOutline() {
    if (this.selectedPath === null) {
      this.showFeedback('Select a point first', true);
      return;
    }
    const tree = this.getActiveTree();
    const node = this.getNodeByPath(tree, this.selectedPath);
    if (node) {
      if (node.contentType === 'table') {
        // Already a table — open its editor instead of wiping its cells.
        const path = [...this.selectedPath];
        this.selectTableNode(node, path);
        this.showFeedback('Point already has a table — edit it in the table editor');
        return;
      }
      FormState.pushHistory();
      if (node.inputField) delete node.inputField;
      node.contentType = 'table';
      const rows = parseInt(document.getElementById('modalTableRows').value) || 3;
      const cols = parseInt(document.getElementById('modalTableCols').value) || 3;
      node.tableData = { rows, cols, cells: {} };
      node.text = `Table ${rows}x${cols}`;
      const path = [...this.selectedPath];
      this.renderOutlineEditor(tree);
      // Open the table editor on the freshly inserted node so its size and
      // cells can be customized right away (rows/cols buttons + cell inputs).
      this.selectTableNode(node, path);
      this.showFeedback(`✓ Table ${rows}x${cols} inserted — customize it in the table editor above`);
    }
  },

  duplicateOutlinePoint() {
    if (this.selectedPath === null) {
      this.showFeedback('Select a point to duplicate', true);
      return;
    }
    const tree = this.getActiveTree();
    const path = this.selectedPath;
    const node = this.getNodeByPath(tree, path);
    if (!node) return;
    const parent = this.getParentByPath(tree, path);
    if (!parent) return;

    FormState.pushHistory();
    const clone = structuredClone(node);
    parent.parent.splice(parent.index + 1, 0, clone);
    this.selectedPath = null;
    this.renderOutlineEditor(tree);
    this.showFeedback('✓ Point duplicated');
  }
};

export default ModalManager;