/**
 * FormForge — DOM Renderer
 *
 * Renders the block list (drag + keyboard reorder), the live preview
 * (build mode / fill-up mode) and the template carousel (built-in demos
 * + saved templates).
 *
 * Security: any content that can come from the user or a scanned document is
 * escaped via escapeHtml() before being placed into innerHTML.
 */
import FormState from './state.js';
import ModalManager from './modal.js';
import { escapeHtml, blockFontCss } from './util.js';

const DOMRenderer = {
  blockListEl: document.getElementById('blockList'),
  previewContent: document.getElementById('previewContent'),
  templateCarousel: document.getElementById('templateCarousel'),
  dragHint: document.getElementById('dragHint'),

  render() {
    this.renderBlockList();
    this.renderPreview();
    this.renderCarousel();
    this.updateModeUI();
  },

  renderBlockList() {
    this.blockListEl.innerHTML = '';
    const blocks = FormState.getBlocks();

    if (blocks.length === 0) {
      this.blockListEl.innerHTML = '<div style="padding:1rem; text-align:center; opacity:0.6;"><i class="fas fa-plus-circle"></i> Add a block</div>';
      return;
    }

    const iconMap = {
      'input':'fa-font', 'heading':'fa-heading', 'subheading':'fa-heading',
      'subsubheading':'fa-heading', 'signature':'fa-pen-fancy',
      'header':'fa-arrow-up', 'footer':'fa-arrow-down', 'page':'fa-hashtag',
      'table':'fa-table', 'numbered':'fa-list-ol'
    };

    blocks.forEach((block, idx) => {
      const div = document.createElement('div');
      div.className = `block-item ${idx === FormState.selectedIndex ? 'selected' : ''}`;
      div.draggable = true;
      div.dataset.index = idx;
      div.tabIndex = 0;
      div.setAttribute('role', 'listitem');
      div.setAttribute('aria-label', `${escapeHtml(block.content || block.type)} — press arrow up/down to reorder`);

      const label = block.content || block.type;
      const typeLabel = this.getTypeLabel(block.type);

      // label is escaped — it may contain user or scanned content
      div.innerHTML = `
        <i class="fas ${iconMap[block.type] || 'fa-cube'} drag-icon"></i>
        <span style="flex:1; font-size:0.9rem; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(label)}</span>
        <span class="block-type">${escapeHtml(typeLabel)}</span>
        <div class="block-actions">
          <button class="edit-block-btn" data-index="${idx}" title="Edit" aria-label="Edit block"><i class="fas fa-pen"></i></button>
          <button class="duplicate-block-btn" data-index="${idx}" title="Duplicate" aria-label="Duplicate block"><i class="fas fa-copy"></i></button>
          <button class="delete-block-btn" data-index="${idx}" title="Delete" aria-label="Delete block"><i class="fas fa-times"></i></button>
        </div>
      `;

      this.blockListEl.appendChild(div);

      div.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', idx));
      div.addEventListener('dragover', (e) => e.preventDefault());
      div.addEventListener('drop', (e) => this.handleDrop(e, idx));
      div.addEventListener('click', () => {
        FormState.selectedIndex = idx;
        this.render();
      });
      // Keyboard reordering: arrow up/down on a focused block item
      div.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' && idx > 0) {
          e.preventDefault();
          FormState.moveBlock(idx, idx - 1);
          this.render();
          this.focusBlockItem(idx - 1);
        } else if (e.key === 'ArrowDown' && idx < blocks.length - 1) {
          e.preventDefault();
          FormState.moveBlock(idx, idx + 1);
          this.render();
          this.focusBlockItem(idx + 1);
        }
      });

      div.querySelector('.edit-block-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        ModalManager.openModal(idx);
      });

      div.querySelector('.duplicate-block-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        FormState.duplicateBlock(idx);
        this.render();
      });

      div.querySelector('.delete-block-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        FormState.removeBlock(idx);
        this.render();
      });
    });
  },

  focusBlockItem(index) {
    const item = this.blockListEl.querySelector(`[data-index="${index}"]`);
    if (item) item.focus();
  },

  handleDrop(e, toIdx) {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
    FormState.moveBlock(fromIdx, toIdx);
    this.render();
  },

  renderPreview() {
    this.previewContent.innerHTML = '';
    const blocks = FormState.getBlocks();

    if (FormState.isFillupMode) {
      this.renderFillupMode(blocks);
    } else {
      this.renderBuildMode(blocks);
    }
  },

  renderBuildMode(blocks) {
    blocks.forEach((block, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-block';
      if (block.indent) wrapper.classList.add(`indent-${block.indent}`);

      let style = blockFontCss(block) + `font-size:${block.fontSize || 16}px;text-align:${block.align || 'left'};`;
      if (block.bold) style += 'font-weight:bold;';
      if (block.italic) style += 'font-style:italic;';
      if (block.underline) style += 'text-decoration:underline;';
      if (block.spacingAfter !== undefined) style += `margin-bottom:${block.spacingAfter}px;`;
      wrapper.style.cssText = style;

      switch (block.type) {
        case 'table':
          wrapper.appendChild(this.renderTable(block, false));
          break;
        case 'numbered':
          wrapper.appendChild(this.renderNumbered(block, false));
          break;
        default:
          const div = document.createElement('div');
          div.contentEditable = true;
          div.dataset.index = idx;
          div.style.cssText = style;
          div.textContent = block.content || block.type;
          div.addEventListener('input', () => {
            FormState.blocks[idx].content = div.textContent;
            FormState.persist();
            this.renderBlockList();
          });
          wrapper.appendChild(div);
      }

      this.previewContent.appendChild(wrapper);
    });
  },

  renderFillupMode(blocks) {
    blocks.forEach((block, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-block';
      if (block.indent) wrapper.classList.add(`indent-${block.indent}`);

      let style = blockFontCss(block) + `font-size:${block.fontSize || 16}px;text-align:${block.align || 'left'};`;
      if (block.bold) style += 'font-weight:bold;';
      if (block.italic) style += 'font-style:italic;';
      if (block.underline) style += 'text-decoration:underline;';
      if (block.spacingAfter !== undefined) style += `margin-bottom:${block.spacingAfter}px;`;
      wrapper.style.cssText = style;

      switch (block.type) {
        case 'table':
          wrapper.appendChild(this.renderTable(block, true));
          break;
        case 'numbered':
          wrapper.appendChild(this.renderNumberedFillup(block));
          break;
        case 'input': {
          const container = document.createElement('div');
          container.className = 'fill-up-inline';

          const label = document.createElement('span');
          label.className = 'fill-label';
          label.textContent = (block.content || 'Input') + ':';
          container.appendChild(label);

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'fill-input-inline';
          input.placeholder = `Enter ${block.content || 'value'}...`;
          input.dataset.index = idx;

          if (FormState.userInputs[idx] !== undefined) {
            input.value = FormState.userInputs[idx];
          }

          input.addEventListener('input', () => {
            FormState.userInputs[idx] = input.value;
            FormState.persist();
          });
          container.appendChild(input);
          wrapper.appendChild(container);
          break;
        }
        default:
          const div = document.createElement('div');
          div.textContent = block.content || block.type;
          wrapper.appendChild(div);
      }

      this.previewContent.appendChild(wrapper);
    });
  },

  renderNumberedFillup(block) {
    const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
    const ul = document.createElement('ul');
    ul.className = 'outline-tree';
    ul.style.textAlign = block.align || 'left';
    this.buildOutlineTreeFillup(ul, tree, 0, block);
    return ul;
  },

  buildOutlineTreeFillup(parentEl, nodes, depth, block) {
    const symbols = ['1.', 'a.', '(1)', '(a)', 'i'];
    const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
    nodes.forEach((node, index) => {
      const li = document.createElement('li');
      li.className = `depth-${depth}`;

      const container = document.createElement('div');
      container.className = 'fill-up-outline';

      const symbolSpan = document.createElement('span');
      symbolSpan.className = 'outline-symbol';
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
      symbolSpan.textContent = symbol + ' ';
      container.appendChild(symbolSpan);

      if (node.contentType === 'table') {
        const tableWrapper = document.createElement('div');
        tableWrapper.style.paddingLeft = (depth * 1.2) + 'rem';
        tableWrapper.style.width = '100%';
        const tbl = this.renderTable(
          { tableData: node.tableData || { rows: 3, cols: 3, cells: {} }, align: block.align || 'left' },
          true
        );
        tableWrapper.appendChild(tbl);
        container.appendChild(tableWrapper);
      } else if (node.inputField) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fill-input-inline';
        input.style.flex = '1 1 140px';
        input.style.minWidth = '80px';
        input.value = node.text || '';
        input.placeholder = 'Enter text...';          input.addEventListener('input', () => {
            node.text = input.value;
            FormState.persist();
          });
          container.appendChild(input);
      } else {
        const span = document.createElement('span');
        span.textContent = node.text || '';
        span.style.flex = '1';
        container.appendChild(span);
      }

      li.appendChild(container);
      parentEl.appendChild(li);

      if (node.children && node.children.length > 0 && depth < 4) {
        const subUl = document.createElement('ul');
        subUl.className = 'outline-tree';
        this.buildOutlineTreeFillup(subUl, node.children, depth + 1, block);
        li.appendChild(subUl);
      }
    });
  },

  renderTable(block, fillup) {
    const table = document.createElement('table');
    table.className = 'preview-table';
    table.style.textAlign = block.align || 'left';
    const data = block.tableData || { rows: 3, cols: 3, cells: {} };
    const rows = data.rows || 3;
    const cols = data.cols || 3;
    const cells = data.cells || {};

    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        const cellKey = `${r}-${c}`;
        const cellContent = cells[cellKey] || '';
        if (fillup) {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'fill-input';
          inp.style.width = '100%';
          inp.style.border = 'none';
          inp.style.background = 'transparent';
          inp.value = cellContent;
          inp.addEventListener('input', () => {
            if (!block.tableData) block.tableData = { rows, cols, cells: {} };
            block.tableData.cells[cellKey] = inp.value;
            FormState.persist();
          });
          td.appendChild(inp);
        } else {
          td.textContent = cellContent;
          td.contentEditable = true;
          td.addEventListener('input', () => {
            if (!block.tableData) block.tableData = { rows, cols, cells: {} };
            block.tableData.cells[cellKey] = td.textContent;
          });
        }
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  },

  renderNumbered(block, fillup) {
    const tree = block.outlineTree || [{ text: 'Item 1', children: [] }];
    const ul = document.createElement('ul');
    ul.className = 'outline-tree';
    ul.style.textAlign = block.align || 'left';
    this.buildOutlineTree(ul, tree, 0, fillup, block);
    return ul;
  },

  buildOutlineTree(parentEl, nodes, depth, fillup, block) {
    const symbols = ['1.', 'a.', '(1)', '(a)', 'i'];
    const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
    nodes.forEach((node, index) => {
      const li = document.createElement('li');
      li.className = `depth-${depth}`;

      const label = document.createElement('span');
      label.className = 'outline-content';
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
        const tableWrapper = document.createElement('div');
        tableWrapper.style.paddingLeft = (depth * 1.2) + 'rem';
        const tbl = this.renderTable(
          { tableData: node.tableData || { rows: 3, cols: 3, cells: {} }, align: block.align || 'left' },
          fillup
        );
        tableWrapper.appendChild(tbl);
        li.appendChild(tableWrapper);
      } else if (node.inputField) {
        const contentSpan = document.createElement('span');
        contentSpan.style.flex = '1';
        if (fillup) {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'fill-input-inline';
          inp.style.border = 'none';
          inp.style.background = 'transparent';
          inp.style.width = 'auto';
          inp.style.minWidth = '60px';
          inp.style.display = 'inline-block';
          inp.value = node.text || '';
          inp.addEventListener('input', () => {
            node.text = inp.value;
            FormState.persist();
          });
          contentSpan.appendChild(inp);
        } else {
          const underline = document.createElement('span');
          underline.textContent = node.text || '';
          underline.style.borderBottom = '1px solid #000';
          underline.style.display = 'inline-block';
          underline.style.minWidth = '80px';
          underline.contentEditable = true;
          underline.addEventListener('input', () => {
            node.text = underline.textContent;
            FormState.persist();
          });
          contentSpan.appendChild(underline);
        }
        li.appendChild(contentSpan);
      } else {
        const contentSpan = document.createElement('span');
        contentSpan.style.flex = '1';
        if (fillup) {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'fill-input-inline';
          inp.style.border = 'none';
          inp.style.background = 'transparent';
          inp.style.width = 'auto';
          inp.style.minWidth = '60px';
          inp.style.display = 'inline-block';
          inp.value = node.text || '';
          inp.addEventListener('input', () => {
            node.text = inp.value;
            FormState.persist();
          });
          contentSpan.appendChild(inp);
        } else {
          contentSpan.textContent = node.text || '';
          contentSpan.contentEditable = true;
          contentSpan.addEventListener('input', () => {
            node.text = contentSpan.textContent;
            FormState.persist();
          });
        }
        li.appendChild(contentSpan);
      }

      parentEl.appendChild(li);

      if (node.children && node.children.length > 0 && depth < 4) {
        const subUl = document.createElement('ul');
        subUl.className = 'outline-tree';
        this.buildOutlineTree(subUl, node.children, depth + 1, fillup, block);
        li.appendChild(subUl);
      }
    });
  },

  renderCarousel() {
    this.templateCarousel.innerHTML = '';
    const demos = FormState.demoTemplates || [];
    const saved = FormState.savedTemplates || [];

    if (demos.length === 0 && saved.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = 'No templates';
      empty.style.opacity = '0.5';
      empty.style.fontSize = '0.8rem';
      this.templateCarousel.appendChild(empty);
      return;
    }

    // Built-in demo templates first
    demos.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'template-chip';
      chip.textContent = t.name;
      chip.title = `Load demo template "${t.name}"`;
      chip.addEventListener('click', () => {
        if (confirm(`Load demo template "${t.name}"? Current blocks will be replaced.`)) {
          FormState.setBlocks(t.blocks);
          DOMRenderer.render();
        }
      });
      this.templateCarousel.appendChild(chip);
    });

    // Saved templates (most recent 8)
    saved.slice(-8).reverse().forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'template-chip';
      chip.textContent = t.name;
      chip.title = `Load ${t.name}`;
      chip.addEventListener('click', () => {
        if (confirm(`Load template "${t.name}"? Current blocks will be replaced.`)) {
          FormState.setBlocks(t.blocks);
          DOMRenderer.render();
        }
      });
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm(`Delete template "${t.name}"?`)) {
          FormState.deleteTemplate(t.name);
          this.renderCarousel();
        }
      });
      this.templateCarousel.appendChild(chip);
    });
  },

  updateModeUI() {
    const modeBuilderBtn = document.getElementById('modeBuilder');
    const modeFillupBtn = document.getElementById('modeFillup');

    if (FormState.isFillupMode) {
      modeFillupBtn.classList.add('active');
      modeBuilderBtn.classList.remove('active');
      this.dragHint.textContent = 'fill-up mode';
    } else {
      modeBuilderBtn.classList.add('active');
      modeFillupBtn.classList.remove('active');
      this.dragHint.textContent = 'drag to reorder';
    }

    this.renderPreview();
  },

  getTypeLabel(type) {
    const map = {
      'input':'Input', 'heading':'Heading', 'subheading':'Sub-heading',
      'subsubheading':'Sub-sub-heading', 'signature':'Signature',
      'header':'Header', 'footer':'Footer', 'page':'Page number',
      'table':'Table', 'numbered':'Outline'
    };
    return map[type] || type;
  }
};

export default DOMRenderer;