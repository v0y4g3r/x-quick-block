const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const script = readFileSync(require.resolve('../content.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 45));
const tweet = handle => `<article data-testid="tweet"><div data-testid="User-Name"><a href="/${handle}">${handle}</a><a href="/${handle}">@${handle}</a></div><button data-testid="caret">More</button></article>`;

function setup(t, html = tweet('alice')) {
  const dom = new JSDOM(html, { url: 'https://x.com/home', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const observers = [];
  const NativeObserver = window.MutationObserver;
  window.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  t.after(() => {
    observers.forEach(observer => observer.disconnect());
    dom.window.close();
  });
  window.Element.prototype.getClientRects = function () { return this.isConnected ? [{}] : []; };
  window.eval(script);
  return window;
}

function nativeFlow(window, { menuHandle = 'alice', dialogHandle = 'alice' } = {}) {
  const doc = window.document;
  const result = { menuClicks: 0, confirmations: 0 };
  doc.querySelector('[data-testid="caret"]').onclick = () => {
    const menu = doc.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<button data-testid="block">Block @${menuHandle}</button>`;
    menu.querySelector('button').onclick = () => {
      result.menuClicks++;
      menu.remove();
      const dialog = doc.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.innerHTML = `<h2>Block @${dialogHandle}?</h2><button data-testid="confirmationSheetConfirm">Block</button>`;
      dialog.querySelector('button').onclick = () => {
        result.confirmations++;
        dialog.remove();
      };
      doc.body.append(dialog);
    };
    doc.body.append(menu);
  };
  return result;
}

test('adds one button per tweet/reply, not ordinary page links', async t => {
  const w = setup(t, tweet('alice') + tweet('bob') + '<a href="/charlie">charlie</a>');
  assert.equal(w.document.querySelectorAll('.xqb-button').length, 2);
  w.document.body.append(w.document.createElement('span'));
  await tick();
  assert.equal(w.document.querySelectorAll('.xqb-button').length, 2);
});

test('supports dynamically loaded replies and recycled tweet nodes', async t => {
  const w = setup(t);
  w.document.body.insertAdjacentHTML('beforeend', tweet('bob'));
  await tick();
  assert.equal(w.document.querySelectorAll('.xqb-button').length, 2);
  const name = w.document.querySelector('[data-testid="User-Name"]');
  name.querySelectorAll('a').forEach(link => link.href = '/charlie');
  await tick();
  assert.equal(name.querySelectorAll('.xqb-button').length, 1);
  assert.equal(name.querySelector('button').dataset.handle, 'charlie');
});

test('uses native block and confirmation; disables duplicate account buttons', async t => {
  const w = setup(t, tweet('alice') + tweet('alice'));
  const result = nativeFlow(w);
  w.document.querySelector('.xqb-button').click();
  await tick();
  assert.equal(result.menuClicks, 1);
  assert.equal(result.confirmations, 1);
  assert.ok([...w.document.querySelectorAll('.xqb-button')].every(b => b.disabled && b.textContent === '已提交'));
});

test('never clicks block when menu names another user', async t => {
  const w = setup(t);
  const result = nativeFlow(w, { menuHandle: 'bob' });
  w.document.querySelector('.xqb-button').click();
  await tick();
  assert.equal(result.menuClicks, 0);
  assert.match(w.document.querySelector('#xqb-toast').textContent, /无法核对/);
});

test('never confirms a dialog for a different account', async t => {
  const w = setup(t);
  const result = nativeFlow(w, { dialogHandle: 'bob' });
  w.document.querySelector('.xqb-button').click();
  await tick();
  assert.equal(result.menuClicks, 1);
  assert.equal(result.confirmations, 0);
  assert.match(w.document.querySelector('#xqb-toast').textContent, /用户名不匹配/);
});

test('leaves pre-existing menus alone', async t => {
  const w = setup(t);
  const result = nativeFlow(w);
  w.document.body.insertAdjacentHTML('beforeend', '<div role="menu">Existing menu</div>');
  w.document.querySelector('.xqb-button').click();
  await tick();
  assert.equal(result.menuClicks, 0);
  assert.equal(w.document.querySelectorAll('[role="menu"]').length, 1);
  assert.match(w.document.querySelector('#xqb-toast').textContent, /请先关闭/);
});

test('ignores non-profile links and foreign domains', t => {
  const w = setup(t, '<article data-testid="tweet"><div data-testid="User-Name"><a href="https://example.com/alice">Alice</a><a href="/home">Home</a><a href="/alice/status/123">Date</a></div></article>');
  assert.equal(w.document.querySelectorAll('.xqb-button').length, 0);
});
