(() => {
  'use strict';
  const BUTTON = 'xqb-button';
  const submitted = new Set();
  let busy = false;
  let scheduled = false;
  let toastTimer;

  function handleFromLink(link) {
    try {
      const url = new URL(link.getAttribute('href'), location.origin);
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return null;
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      const reserved = /^(home|explore|notifications|messages|settings|search|compose|i|intent)$/i;
      return match && !reserved.test(match[1]) ? match[1] : null;
    } catch {
      return null;
    }
  }

  function author(article) {
    const name = article.querySelector('[data-testid="User-Name"]');
    if (!name) return null;
    for (const link of name.querySelectorAll('a[href]')) {
      const handle = handleFromLink(link);
      if (handle) return { name, handle, key: handle.toLowerCase() };
    }
    return null;
  }

  function visible(element) {
    return element && element.isConnected && element.getClientRects().length > 0;
  }

  function notify(message) {
    let toast = document.getElementById('xqb-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'xqb-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
  }

  function waitFor(find, timeout = 5000) {
    return new Promise((resolve, reject) => {
      let observer;
      let timer;
      const check = () => {
        try {
          const result = find();
          if (!result) return;
          observer?.disconnect();
          clearTimeout(timer);
          resolve(result);
        } catch (error) {
          observer?.disconnect();
          clearTimeout(timer);
          reject(error);
        }
      };
      observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('等待 X 界面超时；页面可能改版或网络较慢。请手动检查屏蔽结果。'));
      }, timeout);
      check();
    });
  }

  function refreshButtons() {
    for (const button of document.querySelectorAll(`.${BUTTON}`)) {
      const done = submitted.has(button.dataset.handle.toLowerCase());
      button.disabled = busy || done;
      button.textContent = done ? '已提交' : 'Block';
      button.title = done ? '已提交屏蔽，请以 X 的屏蔽列表为准' : `屏蔽 @${button.dataset.handle}（会自动确认）`;
      button.setAttribute('aria-label', button.title);
    }
  }

  async function block(article, handle) {
    if (busy) return;
    const current = author(article);
    if (!current || current.key !== handle.toLowerCase()) {
      notify('推文已更新，请重新点击对应用户的 Block 按钮。');
      return;
    }
    // Never interact with a menu/dialog that the user already opened.
    if ([...document.querySelectorAll('[role="menu"], [role="dialog"], [data-testid="confirmationSheetDialog"]')].some(visible)) {
      notify('请先关闭已打开的菜单或对话框，再点击 Block。');
      return;
    }
    const caret = article.querySelector('[data-testid="caret"]');
    if (!visible(caret)) {
      notify('找不到这条推文的更多菜单，无法自动屏蔽。');
      return;
    }
    busy = true;
    refreshButtons();
    let ownedMenu = null;
    let clickedBlock = false;
    try {
      caret.click();
      ownedMenu = await waitFor(() => [...document.querySelectorAll('[role="menu"]')].find(visible));
      const item = await waitFor(() => {
        if (!ownedMenu.isConnected) throw new Error('菜单已关闭，操作已停止。');
        return [...ownedMenu.querySelectorAll('[data-testid="block"]')].find(visible);
      });
      // The native Block menu must explicitly name the requested account.
      // Do not infer blocking from translated text or click Unblock/other actions.
      const mentions = (item.textContent || '').match(/@[A-Za-z0-9_]+/g) || [];
      if (!mentions.some(value => value.slice(1).toLowerCase() === current.key)) {
        throw new Error('无法核对菜单中的目标用户名，已停止。请手动屏蔽。');
      }
      item.click();
      clickedBlock = true;
      const confirmation = await waitFor(() => {
        const confirm = [...document.querySelectorAll('[data-testid="confirmationSheetConfirm"]')].find(visible);
        if (!confirm) return null;
        const dialog = confirm.closest('[data-testid="confirmationSheetDialog"], [role="dialog"], [role="alertdialog"]');
        if (!dialog) return null;
        const mentions = (dialog.textContent || '').match(/@[A-Za-z0-9_]+/g) || [];
        if (!mentions.some(value => value.slice(1).toLowerCase() === current.key)) {
          throw new Error('确认框中的用户名不匹配，已停止。请手动检查。');
        }
        return { confirm, dialog };
      });
      confirmation.confirm.click();
      await waitFor(() => !visible(confirmation.dialog), 10000);
      submitted.add(current.key);
      notify(`已通过 X 原生界面提交屏蔽 @${handle}；结果以 X 的提示和屏蔽列表为准。`);
    } catch (error) {
      // Close only our own menu. Leave any confirmation open for manual review.
      if (!clickedBlock && visible(ownedMenu)) {
        ownedMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
      notify(error.message || '无法自动屏蔽，请使用 X 原生菜单。');
    } finally {
      busy = false;
      refreshButtons();
    }
  }

  function scan() {
    scheduled = false;
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const user = author(article);
      if (!user) continue;
      let button = article.querySelector(`.${BUTTON}`);
      if (button && (button.dataset.handle.toLowerCase() !== user.key || button.parentElement !== user.name)) {
        button.remove();
        button = null;
      }
      if (button) continue;
      button = document.createElement('button');
      button.type = 'button';
      button.className = BUTTON;
      button.dataset.handle = user.handle;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void block(article, button.dataset.handle);
      });
      // Prevent a click on this control from opening the tweet itself.
      button.addEventListener('pointerdown', event => event.stopPropagation());
      user.name.append(button);
    }
    refreshButtons();
  }

  const observer = new MutationObserver(records => {
    // Ignore our own label/status changes to prevent observer feedback loops.
    if (!records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return !target?.closest(`.${BUTTON}, #xqb-toast`);
    })) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  scan();
})();
