// 나 — 고르기. 한 칸의 후보 카드를 말풍선으로 늘어놓고, 키 하나로 살림 / 버림 / 넘김.
//   E 살림 · Q 버림 · Space 넘김 (AD 키 설계와 같은 뜻) · Z 되돌림 · ↑ ↓ 옮김
//   줄거리 장면은 하나만 살린다 (pick one — 하나를 살리면 같은 장면의 다른 후보는 버려진다).
//   폰(좁은 화면)에서는 한 장씩 크게: 오른쪽으로 밀면 살림 · 왼쪽으로 밀면 버림 · 아래 버튼.
//   본문 고치기는 없다 — 버리고 다시 뽑는다. 한 줄 메모는 그 카테고리 주문의 note 에 덧붙는다.
import { esc } from './ui.js';
import { cardHtml } from './bubbles.js';

const TAG = { picked: ['살림', 'success'], live: ['게임에 있음', 'success'], dropped: ['버림', 'danger'], draft: ['후보', ''], checked: ['후보', ''] };
const isShown = (status, show) => (show === 'draft' ? status === 'draft' || status === 'checked' : status === show);

function model(M) {
  const cells = M.store.cells();
  const waiting = cells.filter((c) => c.waiting > 0);
  const cell = cells.find((c) => c.key === M.ui.cellKey) ?? waiting[0] ?? cells[0] ?? null;
  if (!cell) return { cells, waiting, cell: null, list: [], side: [], batches: [] };
  if (M.ui.cellKey !== cell.key) { M.ui.cellKey = cell.key; M.ui.touched = new Set(); M.ui.focusId = null; M.ui.batch = ''; }
  const all = M.store.cardsOfCell(cell), show = M.ui.show ?? 'draft';
  // 이 칸에서 이번에 손댄 카드는 정한 뒤에도 자리에 남는다 (되돌릴 수 있게)
  const pool = all.filter((c) => isShown(c.status, show) || M.ui.touched.has(c.id));
  const batches = [...new Set(pool.map((c) => c.batch).filter(Boolean))];
  const list = pool.filter((c) => !M.ui.batch || c.batch === M.ui.batch);
  const side = all.filter((c) => ['live', 'picked'].includes(M.store.effStatus(c)));
  if (!list.some((c) => c.id === M.ui.focusId)) M.ui.focusId = (list.find((c) => isShown(M.store.effStatus(c), show)) ?? list[0])?.id ?? null;
  return { cells, waiting, cell, list, side, batches, all };
}

function decide(M, status) {
  const { cell, list } = model(M);
  const card = list.find((c) => c.id === M.ui.focusId); if (!card) return;
  const changes = [[card.id, status]], one = status === 'picked' && cell.kind === 'story';
  if (one) for (const c of M.store.cardsOfCell(cell)) if (c.id !== card.id && !['live', 'dropped'].includes(M.store.effStatus(c))) changes.push([c.id, 'dropped']);
  for (const [id] of changes) M.ui.touched.add(id);
  M.store.setStatus(changes, one ? card.id : null);
  step(M, 1, true);
}
// 다음 카드로. undecided = 아직 안 정한 것만 찾는다 (없으면 그 자리)
function step(M, d, undecided = false) {
  const { list } = model(M), show = M.ui.show ?? 'draft';
  const i = list.findIndex((c) => c.id === M.ui.focusId);
  for (let j = i + d; j >= 0 && j < list.length; j += d) if (!undecided || isShown(M.store.effStatus(list[j]), show)) { M.ui.focusId = list[j].id; break; }
  M.redraw();
}
function undo(M) {
  const { list } = model(M), show = M.ui.show ?? 'draft';
  let card = list.find((c) => c.id === M.ui.focusId);
  if (card && isShown(M.store.effStatus(card), show)) { const i = list.indexOf(card); card = list.slice(0, i).reverse().find((c) => !isShown(M.store.effStatus(c), show)) ?? null; }
  if (!card) return;
  M.ui.focusId = card.id;
  M.store.setStatus([[card.id, isShown(card.status, show) ? card.status : show]]);
  M.redraw();
}

export const pickView = {
  html(M) {
    const { cells, waiting, cell, list, side, batches } = model(M);
    if (!cell) return '<div class="mk-empty">고를 칸이 없습니다 — 일감 표에서 칸을 누르세요</div>';
    const eff = (c) => M.store.effStatus(c), show = M.ui.show ?? 'draft';
    const left = list.filter((c) => isShown(eff(c), show)).length;
    const note = cell.kind === 'story' ? M.store.sceneOf(cell.scene)?.sc.note : M.store.orderOf(cell.owner, cell.category)?.note;
    const name = cell.kind === 'story' ? cell.scene : cell.category;
    const opt = (c) => `<option value="${esc(c.key)}" ${c.key === cell.key ? 'selected' : ''}>${esc(`${c.kind === 'story' ? c.scene : c.category} · ${c.prev.join(' + ') || '무관'} · ${c.level}${c.waiting ? ` — 후보 ${c.waiting}` : ''}`)}</option>`;
    const cards = list.map((c) => { const [label, tone] = TAG[eff(c)] ?? [eff(c), '']; return `
      <article class="mk-card is-${esc(eff(c))} ${c.id === M.ui.focusId ? 'is-focus' : ''}" data-act="focus" data-id="${esc(c.id)}">
        <div class="mk-card-state"><span class="a-badge ${tone ? `is-${tone}` : ''}">${label}</span><span class="a-faint">${esc(c.batch ?? '')}</span></div>
        ${cardHtml(c)}
        <div class="mk-card-btns"><button class="a-btn" data-act="keep" data-id="${esc(c.id)}">살림 <kbd>E</kbd></button><button class="a-btn" data-act="drop" data-id="${esc(c.id)}">버림 <kbd>Q</kbd></button></div>
      </article>`; }).join('');
    if (M.narrow) {
      const i = list.findIndex((c) => c.id === M.ui.focusId), c = list[i];
      const [label, tn] = c ? (TAG[eff(c)] ?? [eff(c), '']) : ['', ''];
      return `<div class="mk-pick is-one">
        <header class="mk-pick-head">
          <div class="mk-row"><button class="a-btn" data-act="back">←</button>
            <select class="a-select mk-cellsel" data-k="cell">${(waiting.includes(cell) ? waiting : [cell, ...waiting]).map(opt).join('')}<optgroup label="후보가 없는 칸">${cells.filter((x) => !x.waiting && x !== cell).map(opt).join('')}</optgroup></select></div>
          <div class="mk-row"><span class="mk-progress"><b>${cell.alive}</b> / ${cell.want ?? 0}</span><span class="mk-progress"><b>${left}</b><span class="a-faint"> 남은 후보</span></span>
            ${cell.kind === 'story' ? '<span class="a-badge is-info">하나만 살림</span>' : ''}<span class="mk-grow"></span><span class="a-faint">${c ? `${i + 1} / ${list.length}` : ''}</span></div>
          <div class="mk-briefline">${esc(cell.brief ?? '')}</div>
        </header>
        <div class="mk-one-wrap" data-scroll="one">${c ? `<article class="mk-card mk-one is-${esc(eff(c))} is-focus" data-id="${esc(c.id)}">
            <div class="mk-card-state"><span class="a-badge ${tn ? `is-${tn}` : ''}">${label}</span><span class="a-faint">${esc(c.batch ?? '')}</span></div>${cardHtml(c)}</article>
            <div class="mk-row mk-noterow"><input class="a-input mk-note" data-k="note" data-enter="note" placeholder="한 줄 메모 — 이런 건 싫다" maxlength="200"><button class="a-btn" data-act="note">덧붙이기</button></div>`
          : `<div class="mk-empty">${show === 'draft' ? '이 칸에 고를 후보가 없습니다' : '버린 것이 없습니다'}</div>`}</div>
        <footer class="mk-one-bar"><button class="a-btn is-drop" data-act="drop" ${c ? `data-id="${esc(c.id)}"` : 'disabled'}>← 버림</button>
          <button class="a-btn" data-act="prev" ${i > 0 ? '' : 'disabled'}>이전</button><button class="a-btn" data-act="skip" ${c && i < list.length - 1 ? '' : 'disabled'}>넘김</button>
          <button class="a-btn is-keep" data-act="keep" ${c ? `data-id="${esc(c.id)}"` : 'disabled'}>살림 →</button></footer></div>`;
    }
    return `<div class="mk-pick">
      <header class="mk-pick-head">
        <div class="mk-row">
          <button class="a-btn" data-act="back" title="일감 표로">← 일감 표</button>
          <select class="a-select mk-cellsel" data-k="cell">${(waiting.includes(cell) ? waiting : [cell, ...waiting]).map(opt).join('')}<optgroup label="후보가 없는 칸">${cells.filter((c) => !c.waiting && c !== cell).map(opt).join('')}</optgroup></select>
          <span class="mk-progress"><b>${cell.alive}</b> / ${cell.want ?? 0}<span class="a-faint"> 살아 있음 ${cell.have.live + cell.hand} · 고름 ${cell.have.picked}</span></span>
          <span class="mk-progress"><b>${left}</b><span class="a-faint"> 남은 후보</span></span>
          ${cell.kind === 'story' ? '<span class="a-badge is-info">줄거리 장면 — 하나만 살림</span>' : ''}
          <span class="mk-grow"></span>
          <span class="mk-keys"><kbd>E</kbd> 살림 <kbd>Q</kbd> 버림 <kbd>Space</kbd> 넘김 <kbd>Z</kbd> 되돌림 <kbd>↑</kbd><kbd>↓</kbd> 옮김</span>
        </div>
        <div class="mk-row">
          <span class="mk-briefline" title="주문">${esc(cell.brief ?? '') || '<i class="a-faint">주문에 글이 없음</i>'}</span>
          <span class="mk-grow"></span>
          <span class="a-seg">${[['draft', '후보'], ['dropped', '버린 것']].map(([k, l]) => `<button class="${show === k ? 'is-on' : ''}" data-act="show" data-show="${k}">${l}</button>`).join('')}</span>
          ${batches.length > 1 ? `<span class="a-seg"><button class="${M.ui.batch ? '' : 'is-on'}" data-act="batch" data-batch="">묶음 전부</button>${batches.map((b) => `<button class="${M.ui.batch === b ? 'is-on' : ''}" data-act="batch" data-batch="${esc(b)}">${esc(b)}</button>`).join('')}</span>` : batches.length ? `<span class="a-faint a-mono">${esc(batches[0])}</span>` : ''}
          <button class="a-btn ${M.ui.side ? 'is-on' : ''}" data-act="side" title="살아 있는 것과 나란히 — 겹치는지 본다">살아 있는 것 ${side.length}</button>
          <button class="a-btn" data-act="order">주문서</button>
        </div>
        <div class="mk-row mk-noterow">
          <input class="a-input mk-note" data-k="note" data-enter="note" placeholder="한 줄 메모 — 이런 건 싫다 · 이런 게 더 필요하다 (주문의 note 에 덧붙는다)" maxlength="200">
          <button class="a-btn" data-act="note">메모 덧붙이기</button>
          ${note ? `<span class="mk-notes" title="${esc(note)}">${esc(note.split('\n').slice(-2).join(' / '))}</span>` : ''}
        </div>
      </header>
      <div class="mk-pick-body ${M.ui.side ? 'has-side' : ''}">
        <div class="mk-cards" data-scroll="cards">${cards || `<div class="mk-empty">${show === 'draft' ? '이 칸에 고를 후보가 없습니다' : '버린 것이 없습니다'}</div>`}</div>
        ${M.ui.side ? `<aside class="mk-side" data-scroll="side"><div class="mk-side-title">살아 있는 것 ${side.length}</div>${side.map((c) => `<div class="mk-card is-mini is-${esc(eff(c))}">${cardHtml(c, { compact: true })}</div>`).join('') || '<div class="a-faint">아직 없음</div>'}</aside>` : ''}
      </div></div>`;
  },
  after(M, body) { body.querySelector('.mk-card.is-focus')?.scrollIntoView({ block: 'nearest' }); },
  key(M, e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.code === 'KeyE' || k === 'ㄷ') return decide(M, 'picked'), true;
    if (e.code === 'KeyQ' || k === 'ㅂ') return decide(M, 'dropped'), true;
    if (e.code === 'Space') return step(M, 1), true;
    if (e.code === 'KeyZ' || k === 'ㅋ' || e.key === 'Backspace') return undo(M), true;
    if (e.key === 'ArrowDown' || e.code === 'KeyS') return step(M, 1), true;
    if (e.key === 'ArrowUp' || e.code === 'KeyW') return step(M, -1), true;
    return false;
  },
  input(M, t, final) {
    if (t.dataset.k === 'cell' && final) M.go('pick', { cellKey: t.value, touched: new Set(), focusId: null, batch: '' });
  },
  act(M, a, t, e) {
    if (a === 'back') return M.go('plan');
    if (a === 'show') return M.go('pick', { show: t.dataset.show, touched: new Set(), focusId: null });
    if (a === 'batch') return M.go('pick', { batch: t.dataset.batch, focusId: null });
    if (a === 'side') return M.go('pick', { side: !M.ui.side });
    if (a === 'skip') return step(M, 1);
    if (a === 'prev') return step(M, -1);
    if (a === 'order') { const { cell } = model(M); return cell.kind === 'story' ? M.go('story', { sceneId: cell.scene }) : M.go('orders', { owner: cell.owner, cat: cell.category }); }
    if (a === 'note') {
      const box = t.closest('.mk-row').querySelector('[data-k="note"]'), text = box.value.trim();
      if (!text) return;
      box.value = ''; box.blur(); M.store.appendNote(model(M).cell, text);
      return;
    }
    if (a === 'keep' || a === 'drop') { M.ui.focusId = t.dataset.id; e.stopPropagation(); return decide(M, a === 'keep' ? 'picked' : 'dropped'); }
    if (a === 'focus') { M.ui.focusId = t.dataset.id; M.redraw(); }
  },
  // 폰: 카드를 옆으로 밀어 살림(오른쪽) / 버림(왼쪽)
  pointer(M, e) {
    const sw = M.ui.swipe;
    if (e.type === 'pointerdown') {
      const card = e.target.closest?.('.mk-one');
      M.ui.swipe = card && !e.target.closest('button, input, select, textarea') ? { card, x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId } : null;
      return;
    }
    if (!sw || e.pointerId !== sw.id) return;
    if (e.type === 'pointermove') {
      sw.dx = e.clientX - sw.x;
      if (Math.abs(sw.dx) < 8 && !sw.on) return;
      sw.on = true;
      sw.card.style.transition = 'none';
      sw.card.style.transform = `translateX(${sw.dx}px) rotate(${sw.dx / 40}deg)`;
      sw.card.classList.toggle('is-keeping', sw.dx > 70); sw.card.classList.toggle('is-dropping', sw.dx < -70);
      return;
    }
    M.ui.swipe = null;
    sw.card.style.transition = ''; sw.card.style.transform = '';
    sw.card.classList.remove('is-keeping', 'is-dropping');
    if (e.type === 'pointerup' && Math.abs(sw.dx) > 70) { M.ui.focusId = sw.card.dataset.id; decide(M, sw.dx > 0 ? 'picked' : 'dropped'); }
  },
};
