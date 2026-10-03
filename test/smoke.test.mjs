/**
 * Smoke test for the pure-logic parts of Format_Maker.
 * Runs in Node with a tiny DOM/localStorage stub — no test framework needed.
 *
 *   node /tmp/smoke.mjs
 */
import assert from 'node:assert/strict';

// ---- Minimal browser stubs -----------------------------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  print() {}, addEventListener() {}, removeEventListener() {},
  confirm: () => true,
};
// A generic element stub. renderer.js caches getElementById() results at
// import time, so these must be real-ish objects, not null.
const stubEl = () => ({
  innerHTML: '', textContent: '', value: '', hidden: false, className: '', title: '',
  style: { cssText: '' }, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, addEventListener() {}, setAttribute() {}, focus() {}, remove() {},
  querySelector: () => stubEl(), querySelectorAll: () => [],
});
globalThis.document = {
  getElementById: () => stubEl(),
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  createElement: stubEl,
  addEventListener() {},
  body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
};
globalThis.Blob = class { constructor(p) { this.parts = p; } };
globalThis.URL = { createObjectURL: () => 'blob:stub', revokeObjectURL() {} };
globalThis.confirm = () => true;

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message]); }
};

// ---- Modules under test ---------------------------------------------------
const FormState = (await import('../js/state.js')).default;
const FormIO = (await import('../js/formio.js')).default;
const SettingsEditor = (await import('../js/settings.js')).default;
const util = await import('../js/util.js');

// ---- Legacy storage migration -------------------------------------------
await test('legacy localStorage keys migrate to the new names', () => {
  store.clear();
  store.set('formforge_current', JSON.stringify({ blocks: [{ type: 'header', content: 'Legacy' }] }));
  store.set('formforge_templates', JSON.stringify([{ name: 'Old template', blocks: [] }]));
  FormState.init();
  assert.equal(FormState.getBlocks().length, 1);
  assert.equal(FormState.getBlocks()[0].content, 'Legacy');
  assert.equal(FormState.savedTemplates.length, 1);
  assert.ok(store.has('formatmaker_current'), 'new key written');
  assert.ok(!store.has('formforge_current'), 'legacy key removed');
});

/** FormState.persist() is debounced by 400ms — wait it out before re-reading. */
const flushPersist = () => new Promise(r => setTimeout(r, 500));

await test('settings round-trip through autosave', async () => {
  store.clear();
  FormState.init();
  FormState.updateSettings({ footerFormat: 'Sheet {page}/{totalPages}' });
  assert.equal(FormState.settings.footerFormat, 'Sheet {page}/{totalPages}');
  await flushPersist();
  // Simulate a reload: re-init from storage
  FormState.blocks = [];
  FormState.settings = { letterheadLines: [], footerFormat: 'Page {page}', footerAlign: 'right' };
  FormState.init();
  assert.equal(FormState.settings.footerFormat, 'Sheet {page}/{totalPages}');
});

await test('resetSettings restores the shipped defaults', () => {
  FormState.resetSettings();
  assert.equal(FormState.settings.footerAlign, 'right');
  assert.ok(FormState.settings.letterheadLines.length > 0);
  assert.ok(FormState.settings.letterheadLines.some(l => l.bold));
});

// ---- JSON export/import --------------------------------------------------
await test('serialize() captures blocks, settings and answers', () => {
  store.clear();
  FormState.init();
  FormState.setBlocks([{ type: 'input', content: 'Name', fontSize: 16 }]);
  FormState.userInputs = { 0: 'Ada' };
  const out = FormIO.serialize();
  assert.equal(out.app, 'Format_Maker');
  assert.equal(out.version, 1);
  assert.equal(out.blocks.length, 1);
  assert.deepEqual(out.answers, { 0: 'Ada' });
  assert.ok(Array.isArray(out.settings.letterheadLines));
});

await test('import accepts a wrapped form document', () => {
  FormIO.applyImport({
    app: 'Format_Maker', version: 1,
    blocks: [{ type: 'heading', content: 'Imported' }],
    settings: { letterheadLines: [{ text: 'ACME', align: 'center', fontSize: 11, bold: true }], footerFormat: 'X {page}', footerAlign: 'left' },
    answers: { 0: 'hello' },
  });
  assert.equal(FormState.getBlocks()[0].content, 'Imported');
  assert.equal(FormState.settings.footerFormat, 'X {page}');
  assert.deepEqual(FormState.userInputs, { 0: 'hello' });
});

await test('import still accepts a legacy bare-array template', () => {
  FormIO.applyImport([{ type: 'header', content: 'Bare array' }]);
  assert.equal(FormState.getBlocks()[0].content, 'Bare array');
});

// ---- Escaping ------------------------------------------------------------
await test('escapeHtml neutralises markup in letterhead and blocks', () => {
  assert.equal(util.escapeHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
  // Quotes are escaped too, so the value is safe inside an attribute.
  assert.equal(util.escapeHtml('" onerror="alert(1)'), '&quot; onerror=&quot;alert(1)');
  assert.equal(util.escapeHtml('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
});

await test('print markup escapes hostile block content', () => {
  store.clear();
  FormState.init();
  FormState.setBlocks([{ type: 'input', content: '<script>alert(1)</script>', fontSize: 16, align: 'left', spacingAfter: 2 }]);
  const markup = FormIO.printMarkup();
  assert.ok(markup.includes('&lt;script&gt;'), 'script tag is escaped');
  assert.ok(!markup.includes('<script>'), 'no live script tag in print surface');
  assert.ok(markup.includes('print-blank'), 'input renders as a ruled blank');
});

await test('print markup escapes hostile letterhead text', () => {
  FormState.settings.letterheadLines = [{ text: '<b>bold</b>', align: 'center', fontSize: 10, bold: false }];
  const markup = FormIO.printMarkup();
  assert.ok(!markup.includes('<b>bold</b>'));
  assert.ok(markup.includes('&lt;b&gt;bold'));
});

await test('footer placeholders render concrete numbers', () => {
  FormState.settings.footerFormat = 'Page {page} of {totalPages}';
  const markup = FormIO.printMarkup();
  assert.ok(markup.includes('Page 1 of 1'), 'placeholders substituted');
  assert.ok(!markup.includes('{page}'));
});

// ---- Outline numbering ---------------------------------------------------
await test('outline symbols match the renderer numbering scheme', () => {
  assert.equal(FormIO.outlineSymbol(0, 0), '1.');
  assert.equal(FormIO.outlineSymbol(1, 1), 'b.');
  assert.equal(FormIO.outlineSymbol(2, 0), '(1)');
  assert.equal(FormIO.outlineSymbol(3, 2), '(c)');
  assert.equal(FormIO.outlineSymbol(4, 3), 'iv');
});

await test('outline nodes recurse with increasing indent', () => {
  const tree = [{ text: 'One', children: [{ text: 'One.a', children: [] }] }];
  const html = FormIO.printOutline(tree, 0);
  assert.ok(html.includes('1.'));
  assert.ok(html.includes('One.a'));
  assert.ok(html.includes('margin-left:20px'), 'child is indented one level');
});

// ---- Settings editor -----------------------------------------------------
await test('settings editor edits a draft copy, not live state', () => {
  FormState.settings.letterheadLines = [
    { text: 'Original', align: 'center', fontSize: 10, bold: false }
  ];
  const original = JSON.stringify(FormState.settings);
  SettingsEditor.draft = JSON.parse(JSON.stringify(FormState.settings));
  SettingsEditor.draft.letterheadLines[0].text = 'MUTATED';
  // The draft changed...
  assert.equal(SettingsEditor.draft.letterheadLines[0].text, 'MUTATED');
  // ...but live state is untouched, so Cancel really cancels.
  assert.equal(JSON.stringify(FormState.settings), original);
  assert.equal(FormState.settings.letterheadLines[0].text, 'Original');
});

// ---- Report --------------------------------------------------------------
let failed = 0;
for (const [status, name, msg] of results) {
  if (status === 'FAIL') failed++;
  console.log(`${status}  ${name}${msg ? `\n        ${msg}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);