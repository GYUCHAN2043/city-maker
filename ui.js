// ST 메이커 — 화면들이 같이 쓰는 작은 것. 런처의 셸에 기대지 않는다 (같은 화면이 밖의 브라우저에서도 돈다 — 넘김 10절).
export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 확인 창 — 돈이 드는 일 · 지우는 일 앞에서만. Promise<boolean>
export function confirmBox(root, { title, html = '', okLabel = '확인', danger = false }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'mk-modal-back';
    back.innerHTML = `<div class="mk-modal" role="dialog" aria-modal="true"><div class="mk-modal-title"></div><div class="mk-modal-body">${html}</div>
      <div class="mk-modal-actions"><button class="a-btn" data-a="cancel">취소</button><button class="a-btn ${danger ? 'a-danger' : 'a-primary'}" data-a="ok"></button></div></div>`;
    back.querySelector('.mk-modal-title').textContent = title;
    back.querySelector('[data-a="ok"]').textContent = okLabel;
    const done = (v) => { back.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.dataset.a === 'cancel') done(false); else if (e.target.dataset.a === 'ok') done(true); });
    document.addEventListener('keydown', key, true);
    root.appendChild(back);
    back.querySelector('[data-a="ok"]').focus();
  });
}
