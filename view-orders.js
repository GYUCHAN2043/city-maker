// 라 — 주문서. 카테고리 나무(폴더 그대로) + 그 카테고리를 쓰는 패턴(앞뒤로 무엇이 이어지나 — 맥락의 근거).
// 카테고리를 고르면 주문(brief · who · shape · want · levels · note)을 고친다 → Cards/<주인>/orders.json.
// 이름은 표에서만 태어난다 (D-042): 화면은 카테고리를 만들지 않는다 — 나무에 없는 이름의 주문은 빨갛게 보여 주고 끝.
import { esc } from './ui.js';
import { LEVELS, WHO } from './store.js';
import { cardHtml } from './bubbles.js';

const covers = (step, cat) => step === cat || cat.startsWith(`${step}/`) || step.startsWith(`${cat}/`);
const blank = () => ({ brief: '', who: '', shape: '', want: 10, levels: ['general'], note: '' });
let timer = null;

function model(M) {
  const S = M.S;
  let owner = S.owners.find((o) => o.id === M.ui.owner) ?? S.owners.find((o) => o.id === Object.keys(S.orders)[0]) ?? S.owners.find((o) => !o.id.startsWith('_')) ?? S.owners[0] ?? null;
  if (!owner) return { owner: null };
  M.ui.owner = owner.id;
  const orders = S.orders[owner.id]?.orders ?? {};
  const ghosts = owner.patterns ? Object.keys(orders).filter((c) => !owner.categories.some((x) => x.id === c)) : [];
  if (M.ui.cat == null || (!owner.categories.some((c) => c.id === M.ui.cat) && !ghosts.includes(M.ui.cat))) M.ui.cat = owner.categories[0]?.id ?? null;
  const cells = M.store.cells().filter((c) => c.kind !== 'story' && c.owner === owner.id);
  const sum = (cat) => cells.filter((c) => c.category === cat).reduce((a, c) => ({ have: a.have + c.alive, want: a.want + (c.want ?? 0), draft: a.draft + c.waiting }), { have: 0, want: 0, draft: 0 });
  // 그 카테고리를 쓰는 패턴 · 앞에 오는 것: 나무를 읽는 길에서는 패턴의 차례 그대로, 아니면 일감 표의 칸에 실려 온 것
  const use = (cat) => { const c = cells.find((x) => x.category === cat); return { patterns: c?.patterns ?? [], after: c?.after ?? [] }; };
  return { owner, orders, ghosts, sum, use, cat: M.ui.cat, order: orders[M.ui.cat] ?? null, ghost: owner.patterns ? ghosts.includes(M.ui.cat) : false };
}

function readForm(root) {
  const v = (k) => root.querySelector(`[data-f="${k}"]`)?.value ?? '';
  const o = { brief: v('brief').trim(), who: v('who'), shape: v('shape'), want: Math.max(0, parseInt(v('want'), 10) || 0),
    levels: LEVELS.filter((l) => root.querySelector(`[data-level="${l}"]`)?.checked), note: v('note').trim() };
  // 앞 맥락의 변형 (plan.py 가 읽는다): 낱말마다 prev_want 장 — 비우면 칸에서 뺀다
  const prev = v('prev').split(',').map((x) => x.trim()).filter(Boolean);
  return { ...o, prev: prev.length ? prev : undefined, prev_want: prev.length ? Math.max(0, parseInt(v('prev_want'), 10) || 0) : undefined };
}
function save(M, root) {
  clearTimeout(timer); timer = null;
  const { owner, cat, order } = model(M); if (!owner || !cat || !root.querySelector('[data-f="brief"]')) return;
  const next = { ...(order ?? {}), ...readForm(root) };                           // 모르는 칸(acts …)은 그대로 둔다
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  if (order && !('note' in order) && !next.note) delete next.note;              // 없던 칸을 빈 채로 늘리지 않는다 (diff 를 작게)
  M.store.saveOrder(owner.id, cat, next);
}

export const ordersView = {
  html(M) {
    const S = M.S, m = model(M);
    if (!m.owner) return '<div class="mk-empty">카테고리가 없습니다 — Game/Content/&lt;팩&gt;/&lt;주인&gt;/st/**/_category.json</div>';
    const { owner, orders, ghosts, sum, use, cat, order, ghost } = m;
    const has = (id) => owner.categories.some((x) => x.id === id);
    const tree = owner.categories.map((c) => { const s = sum(c.id), o = orders[c.id], nested = c.depth > 0 && has(c.id.split('/').slice(0, -1).join('/')); return `
      <button class="mk-node ${c.id === cat ? 'is-on' : ''} ${o ? 'has-order' : 'no-order'}" data-act="cat" data-cat="${esc(c.id)}" style="padding-left:${10 + (nested ? c.depth : 0) * 16}px">
        <span class="mk-dot"></span><span class="a-mono mk-node-name">${esc(nested ? c.id.split('/').pop() : c.id)}</span>
        <span class="mk-grow"></span>${o ? `<span class="mk-node-n ${s.have < s.want ? 'is-missing' : ''}">${s.have} / ${o.want ?? s.want}</span>` : '<span class="mk-node-none">주문 없음</span>'}</button>`; }).join('');
    const ghostRows = ghosts.map((g) => `<button class="mk-node is-ghost ${g === cat ? 'is-on' : ''}" data-act="cat" data-cat="${esc(g)}"><span class="mk-dot"></span><span class="a-mono mk-node-name">${esc(g)}</span><span class="mk-grow"></span><span>없는 카테고리</span></button>`).join('');
    const o = order ?? blank();
    const shapes = Object.keys(S.shapes);
    const badShape = o.shape && !shapes.includes(o.shape), badWho = o.who && !WHO.some((w) => w.id === o.who);
    const noOrders = owner.categories.filter((c) => !orders[c.id]).length;
    const form = !cat ? '' : `
      <div class="mk-form-head"><span class="mk-form-title a-mono">${esc(cat)}</span><span class="a-faint">${esc(owner.id)}</span>
        ${owner.categories.find((c) => c.id === cat)?.pick ? `<span class="a-badge" title="_category.json 의 pick">pick: ${esc(owner.categories.find((c) => c.id === cat).pick)}</span>` : ''}
        <span class="mk-grow"></span>${order ? '<span class="a-badge is-success">주문 있음</span><button class="a-btn" data-act="remove">주문 지우기</button>' : '<span class="a-badge">주문 없음 — 적으면 생긴다</span>'}</div>
      ${ghost ? '<div class="mk-warn">이 주인의 st/ 에 없는 카테고리입니다. 화면은 카테고리를 만들지 않습니다 — 폴더와 _category.json 이 먼저 있어야 합니다.</div>' : ''}
      <div class="mk-form">
        <label>주문<textarea class="a-input" data-f="brief" rows="3" placeholder="이 카테고리에 무엇을 채울지 한 줄 — 한국어로 편하게" ${ghost ? 'disabled' : ''}>${esc(o.brief ?? '')}</textarea></label>
        <div class="mk-form-row">
          <label class="${!o.who || badWho ? 'is-bad' : ''}">누가 누구에게<select class="a-select" data-f="who" ${ghost ? 'disabled' : ''}><option value="">— 고르기 —</option>${WHO.map((w) => `<option value="${w.id}" ${o.who === w.id ? 'selected' : ''}>${esc(w.label)} (${w.id})</option>`).join('')}${badWho ? `<option value="${esc(o.who)}" selected>${esc(o.who)} — 모르는 갈래</option>` : ''}</select></label>
          <label class="${!o.shape || badShape ? 'is-bad' : ''}">틀<select class="a-select" data-f="shape" ${ghost ? 'disabled' : ''}><option value="">— 고르기 —</option>${shapes.map((s) => `<option value="${esc(s)}" ${o.shape === s ? 'selected' : ''}>${esc(s)}${S.shapes[s]?.planned ? ' (아직 굽지 못함)' : ''}</option>`).join('')}${badShape ? `<option value="${esc(o.shape)}" selected>${esc(o.shape)} — 없는 틀</option>` : ''}</select></label>
          <label>살아 있어야 할 장수<input class="a-input" type="number" min="0" max="999" data-f="want" value="${esc(o.want ?? 0)}" ${ghost ? 'disabled' : ''}></label>
          <div class="mk-levels"><span>수위</span><span>${LEVELS.map((l) => `<label><input type="checkbox" data-level="${l}" ${(o.levels ?? []).includes(l) ? 'checked' : ''} ${ghost ? 'disabled' : ''}>${l}</label>`).join('')}</span></div>
        </div>
        <div class="mk-form-row">
          <label>앞 맥락의 변형 (prev) <span class="a-faint">상황 사전의 낱말 · 쉼표로</span><input class="a-input a-mono ${(o.prev ?? []).some((w) => S.words && !S.words.situations.has(w) && !S.words.readOnly.has(w)) ? 'is-bad' : ''}" data-f="prev" value="${esc((o.prev ?? []).join(', '))}" spellcheck="false" ${ghost ? 'disabled' : ''}></label>
          <label>맥락마다 장수 (prev_want)<input class="a-input" type="number" min="0" max="999" data-f="prev_want" value="${esc(o.prev_want ?? 5)}" ${ghost ? 'disabled' : ''}></label>
        </div>
        <label>메모 (note)<textarea class="a-input" data-f="note" rows="3" placeholder="이런 건 싫다 · 이런 게 더 필요하다 — 고르기에서 적은 한 줄 메모도 여기에 쌓인다" ${ghost ? 'disabled' : ''}>${esc(o.note ?? '')}</textarea></label>
        <div class="mk-saved a-faint">${order ? '고치면 바로 Cards/' + esc(owner.id) + '/orders.json 에 ' + (S.kind === 'github' ? '커밋된다' : '적힌다') : ''}</div>
      </div>`;
    // 이 카테고리를 쓰는 패턴 — 앞에 무엇이 오나가 맥락의 근거 (D-045)
    const pats = owner.patterns ? owner.patterns.filter((p) => cat && p.steps.some((s) => covers(s, cat))) : use(cat).patterns.map((id) => ({ id, steps: [], when: [] }));
    const before = owner.patterns ? [...new Set(pats.flatMap((p) => p.steps.flatMap((s, i) => (covers(s, cat) && i > 0 ? [p.steps[i - 1]] : []))))] : use(cat).after;
    const patHtml = pats.map((p) => `<div class="mk-pat"><span class="a-mono mk-pat-id">${esc(p.id)}</span>${p.steps.length ? `<span class="mk-steps">${p.steps.map((s) => `<span class="mk-step ${covers(s, cat) ? 'is-on' : ''}">${esc(s)}</span>`).join('<i>→</i>')}</span>` : ''}
      ${p.when.length ? `<span class="a-faint a-mono mk-when">${esc(p.when.join(' · '))}</span>` : ''}</div>`).join('');
    const live = S.cards.filter((c) => c.category === cat && (!c.owner || c.owner === owner.id) && ['live', 'picked'].includes(M.store.effStatus(c)));
    const files = M.ui.stDir?.[`${owner.id}/${cat}`];
    const pickCat = M.narrow ? `<select class="a-select mk-catsel" data-k="cat">${owner.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === cat ? 'selected' : ''}>${esc(c.id)}${orders[c.id] ? '' : ' — 주문 없음'}</option>`).join('')}${ghosts.map((g) => `<option value="${esc(g)}" ${g === cat ? 'selected' : ''}>${esc(g)} — 없는 카테고리</option>`).join('')}</select>` : '';
    return `<div class="mk-orders">
      ${pickCat}
      <aside class="mk-tree" data-scroll="tree">
        ${S.owners.length > 1 ? `<select class="a-select mk-owner" data-k="owner">${S.owners.map((x) => `<option value="${esc(x.id)}" ${x.id === owner.id ? 'selected' : ''}>${esc(x.id)}</option>`).join('')}</select>` : `<div class="mk-side-title">${esc(owner.id)}</div>`}
        <div class="mk-tree-note">${noOrders ? `<b>${noOrders}</b> 카테고리에 주문이 없음` : '모든 카테고리에 주문이 있음'}</div>
        ${tree}${ghostRows}
      </aside>
      <section class="mk-order" data-scroll="order">${form}</section>
      <aside class="mk-ctx" data-scroll="ctx">
        <div class="mk-side-title">이 카테고리를 쓰는 패턴 ${pats.length}</div>
        ${patHtml || '<div class="mk-warnline">쓰는 패턴이 없음 — 이 카테고리의 ST 는 칸에 오르지 않는다</div>'}
        ${before.length ? `<div class="mk-before">앞에 오는 것: ${before.map((b) => `<span class="mk-step">${esc(b)}</span>`).join(' ')} <span class="a-faint">— 앞 맥락(prev)의 근거</span></div>` : ''}
        <div class="mk-side-title">살아 있는 것 ${live.length}${files ? `<span class="a-faint"> · 폴더의 ST ${files.length}</span>` : ''}</div>
        ${live.slice(0, 8).map((c) => `<div class="mk-card is-mini">${cardHtml(c, { compact: true })}</div>`).join('') || '<div class="a-faint">카드로 살아 있는 것이 아직 없음</div>'}
        ${live.length > 8 ? `<div class="a-faint">… ${live.length - 8}장 더</div>` : ''}
        ${files?.length ? `<div class="mk-files a-mono a-faint">${files.map(esc).join(' · ')}</div>` : ''}
      </aside></div>`;
  },
  after(M) {
    // 그 폴더에 있는 ST 의 이름 (파일 이름만 — 본문은 읽지 않는다)
    const { owner, cat, ghost } = model(M); if (!owner || !cat || ghost) return;
    const k = `${owner.id}/${cat}`; M.ui.stDir ??= {};
    if (k in M.ui.stDir) return;
    M.ui.stDir[k] = null;
    M.store.backend.stFiles(owner.id, cat).then((d) => { M.ui.stDir[k] = d; if (d && M.view === 'orders' && !document.activeElement?.matches?.('textarea, input:not([type=checkbox])')) M.redraw(); }, () => { M.ui.stDir[k] = null; });
  },
  input(M, t, final) {
    if (t.dataset.k === 'owner') { if (final) M.go('orders', { owner: t.value, cat: null }); return; }
    if (t.dataset.k === 'cat') { if (final) M.go('orders', { cat: t.value }); return; }
    if (!t.dataset.f && !t.dataset.level) return;
    const root = t.closest('.mk-order');
    clearTimeout(timer);
    if (final) save(M, root); else timer = setTimeout(() => save(M, root), 600);
  },
  act(M, a, t) {
    if (a === 'cat') return M.go('orders', { cat: t.dataset.cat });
    if (a === 'remove') { const { owner, cat } = model(M); M.store.saveOrder(owner.id, cat, null); }
  },
};
