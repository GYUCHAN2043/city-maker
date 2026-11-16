// 다 — 줄거리 표. 가로 = 진행(문턱의 순서) · 세로 = 줄(lane) · 칸에 장면 카드. (스토릿 꼴: 장면마다 문턱 — 가지로 잇지 않는다)
//   파일: Cards/<팩>/_story/<id>.json — 줄기 하나가 파일 하나. 장면을 끌어 순서 · 줄기를 바꾸고, 눌러서 주문 · 문턱 · 남기는 낱말을 고친다.
//   문턱이 받는 낱말(prev:낱말)을 아무도 안 남기면 빨갛게 (끊긴 이음). 사전 · 값 표에 없는 이름도 빨갛게 — 화면은 이름을 만들지 않는다 (D-042).
import { esc } from './ui.js';
import { LEVELS, WHO } from './store.js';

// 엔진 조건의 머리 (지금 콘텐츠의 when 에 나오는 것 + 날) — 문턱의 이름이 이 가운데 · 사전 · 값 표에 없으면 "모르는 이름"
const ENGINE = new Set(['day', 'time', 'weather', 'memory', 'doing', 'near', 'beside', 'passing', 'far', 'knows', 'count', 'state', 'lv', 'at', 'outside', 'wear', 'has', 'body', 'notable', 'time_spent', 'gazed_by']);
const ID = /^[a-z][a-z0-9_]*$/;
const list = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const keyOf = (st) => `${st.pack}/${st.data.id}`;
let timer = null, dragging = null;

function model(M) {
  const S = M.S, stories = S.stories;
  const all = stories.flatMap((st) => st.data.scenes.map((sc, i) => ({ sc, st, i })));
  const byId = new Map(); const dup = new Set();
  for (const x of all) { if (byId.has(x.sc.id)) dup.add(x.sc.id); else byId.set(x.sc.id, x); }
  const leavers = new Map();
  for (const x of all) for (const w of x.sc.leaves ?? []) (leavers.get(w) ?? leavers.set(w, []).get(w)).push(x.sc.id);
  // 진행의 자리: 앞 장면(after) · 받는 낱말을 남기는 장면 · 같은 줄기의 바로 앞 — 그 뒤 칸
  const rank = new Map(), going = new Set();
  const get = (x) => {
    if (rank.has(x.sc)) return rank.get(x.sc);
    if (going.has(x.sc)) return 0;
    going.add(x.sc);
    const deps = [];
    if (x.sc.after && byId.has(x.sc.after)) deps.push(byId.get(x.sc.after));
    for (const g of x.sc.gate ?? []) if (g.startsWith('prev:')) for (const d of leavers.get(g.slice(5)) ?? []) if (d !== x.sc.id) deps.push(byId.get(d));
    if (x.i > 0) deps.push({ sc: x.st.data.scenes[x.i - 1], st: x.st, i: x.i - 1 });
    let r = 0; for (const d of deps) if (d && d.sc !== x.sc) r = Math.max(r, get(d) + 1);
    going.delete(x.sc); rank.set(x.sc, r); return r;
  };
  all.forEach(get);
  const cols = Math.max(0, ...rank.values()) + 1;
  const lanes = [...new Set(stories.map((st) => st.data.lane || 'main'))].sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)));
  const cells = M.store.cells().filter((c) => c.kind === 'story');
  const sel = all.find((x) => x.sc.id === M.ui.sceneId) ?? null;
  const story = sel?.st ?? stories.find((st) => keyOf(st) === M.ui.storyKey) ?? null;
  return { S, stories, all, byId, dup, leavers, rank, cols, lanes, cells, sel, story };
}
// 사전을 못 읽는 길(밖)에서는 낱말을 따지지 않는다 — 끊긴 이음만 본다
const known = (S, w) => !S.words || S.words.situations.has(w) || S.words.readOnly.has(w);
function gateChip(m, g) {
  if (g.startsWith('prev:')) {
    const w = g.slice(5);
    if (!m.leavers.has(w)) return `<span class="mk-chip is-broken" title="끊긴 이음 — 이 낱말을 남기는 장면이 없음">${esc(g)}</span>`;
    return `<span class="mk-chip is-gate ${known(m.S, w) ? '' : 'is-unknown'}" title="${known(m.S, w) ? '받는 낱말' : '상황 사전에 없는 낱말'}">${esc(g)}</span>`;
  }
  const name = g.match(/^!?([a-z_]+)/)?.[1] ?? '';
  const ok = !m.S.words || ENGINE.has(name) || m.S.words.values.has(name) || known(m.S, name);
  return `<span class="mk-chip is-gate ${ok ? '' : 'is-unknown'}" title="${ok ? '문턱' : '모르는 이름 — 엔진 조건 · 상황 사전 · 값 표에 없음'}">${esc(g)}</span>`;
}
function statusOf(m, sc) {
  const c = m.cells.find((x) => x.scene === sc.id);
  if (c?.have.live) return ['게임에 있음', 'success'];
  if (c?.have.picked) return ['고름', 'success'];
  if (c?.waiting) return [`후보 ${c.waiting}`, 'info'];
  return ['주문만', ''];
}

function sceneCard(M, m, x) {
  const sc = x.sc, [label, tone] = statusOf(m, sc);
  const bad = m.dup.has(sc.id) || (sc.after && !m.byId.has(sc.after));
  return `<article class="mk-scene ${M.ui.sceneId === sc.id ? 'is-on' : ''} ${bad ? 'is-bad' : ''}" draggable="true" data-act="scene" data-scene="${esc(sc.id)}" style="grid-column:${m.rank.get(sc) + 2}">
    <div class="mk-scene-head"><span class="a-mono">${esc(sc.id)}</span><span class="mk-grow"></span><span class="a-badge ${tone ? `is-${tone}` : ''}">${esc(label)}</span></div>
    <div class="mk-scene-brief">${esc(sc.brief ?? '') || '<i class="a-faint">주문이 비었음</i>'}</div>
    <div class="mk-chips">${(sc.gate ?? []).map((g) => gateChip(m, g)).join('')}${sc.after ? `<span class="mk-chip ${m.byId.has(sc.after) ? '' : 'is-broken'}" title="앞 장면 (after)">← ${esc(sc.after)}</span>` : ''}</div>
    <div class="mk-chips">${(sc.leaves ?? []).map((w) => `<span class="mk-chip is-leave ${known(m.S, w) ? '' : 'is-unknown'}" title="${known(m.S, w) ? '남기는 낱말' : '남기는 낱말 — 상황 사전에 없음'}">→ ${esc(w)}</span>`).join('')}
      <span class="mk-grow"></span><span class="a-faint">${esc([sc.who, sc.shape, sc.level].filter(Boolean).join(' · '))}</span></div>
  </article>`;
}

function sceneForm(M, m) {
  const { sc, st } = m.sel, S = m.S, shapes = Object.keys(S.shapes);
  const owners = [...new Set([...S.owners.map((o) => o.id), sc.owner].filter(Boolean))];
  return `<div class="mk-form-head"><span class="mk-form-title">장면</span><span class="a-faint a-mono">${esc(keyOf(st))}</span><span class="mk-grow"></span>
      <button class="a-btn" data-act="to-pick">고르기</button><button class="a-btn" data-act="del-scene">장면 지우기</button></div>
    ${M.ui.storyMsg ? `<div class="mk-warn">${esc(M.ui.storyMsg)}</div>` : ''}
    <div class="mk-form" data-form="scene">
      <label>id<input class="a-input a-mono" data-f="id" value="${esc(sc.id)}" spellcheck="false"></label>
      <label>주문<textarea class="a-input" data-f="brief" rows="3" placeholder="이 장면에서 일어나는 일 한 줄">${esc(sc.brief ?? '')}</textarea></label>
      <div class="mk-form-row">
        <label>누가 누구에게<select class="a-select" data-f="who"><option value="">— 고르기 —</option>${WHO.map((w) => `<option value="${w.id}" ${sc.who === w.id ? 'selected' : ''}>${esc(w.label)}</option>`).join('')}${sc.who && !WHO.some((w) => w.id === sc.who) ? `<option value="${esc(sc.who)}" selected>${esc(sc.who)}</option>` : ''}</select></label>
        <label>틀<select class="a-select" data-f="shape"><option value="">— 고르기 —</option>${[...new Set([...shapes, sc.shape].filter(Boolean))].map((s) => `<option value="${esc(s)}" ${sc.shape === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label>수위<select class="a-select" data-f="level">${LEVELS.map((l) => `<option ${(sc.level ?? 'general') === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label>문턱 (gate) <span class="a-faint">쉼표로 — day:0 · prev:낱말 · popularity>=20</span><input class="a-input a-mono" data-f="gate" value="${esc((sc.gate ?? []).join(', '))}" spellcheck="false"></label>
      <label>남기는 낱말 (leaves) <span class="a-faint">쉼표로 — 다음 장면의 문턱이 받는다</span><input class="a-input a-mono" data-f="leaves" value="${esc((sc.leaves ?? []).join(', '))}" spellcheck="false"></label>
      <div class="mk-form-row">
        <label>앞 장면 (after)<select class="a-select" data-f="after"><option value="">없음 — 문턱만</option>${st.data.scenes.filter((x) => x !== sc).map((x) => `<option value="${esc(x.id)}" ${sc.after === x.id ? 'selected' : ''}>${esc(x.id)}</option>`).join('')}${sc.after && !st.data.scenes.some((x) => x.id === sc.after) ? `<option value="${esc(sc.after)}" selected>${esc(sc.after)} — 없는 장면</option>` : ''}</select></label>
        <label class="${sc.owner && !S.owners.some((o) => o.id === sc.owner) ? 'is-bad' : ''}">주인 (owner)<select class="a-select" data-f="owner"><option value="">—</option>${owners.map((o) => `<option value="${esc(o)}" ${sc.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      </div>
      <label>메모 (note)<textarea class="a-input" data-f="note" rows="2">${esc(sc.note ?? '')}</textarea></label>
    </div>`;
}
function storyForm(M, m) {
  const d = m.story.data;
  return `<div class="mk-form-head"><span class="mk-form-title">줄기</span><span class="a-faint a-mono">Cards/${esc(keyOf(m.story).replace('/', '/_story/'))}.json</span></div>
    <div class="mk-form" data-form="story">
      <label>제목<input class="a-input" data-f="title" value="${esc(d.title ?? '')}"></label>
      <label>줄 (lane)<input class="a-input a-mono" data-f="lane" list="mk-lanes" value="${esc(d.lane ?? 'main')}" spellcheck="false"><datalist id="mk-lanes">${m.lanes.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></label>
      <label>줄거리 한 줄 (outline)<textarea class="a-input" data-f="outline" rows="4">${esc(d.outline ?? '')}</textarea></label>
    </div>`;
}

function save(M, root) {
  clearTimeout(timer); timer = null;
  const m = model(M), form = root?.querySelector('[data-form]'); if (!form) return;
  const v = (k) => form.querySelector(`[data-f="${k}"]`)?.value ?? '';
  if (form.dataset.form === 'story' && m.story) {
    Object.assign(m.story.data, { title: v('title').trim(), lane: v('lane').trim() || 'main', outline: v('outline').trim() });
    return M.store.saveStory(m.story);
  }
  if (form.dataset.form !== 'scene' || !m.sel) return;
  const { sc, st } = m.sel, id = v('id').trim();
  M.ui.storyMsg = '';
  if (id !== sc.id) {
    if (!ID.test(id)) M.ui.storyMsg = `id 는 소문자 · 숫자 · 밑줄 (${id})`;
    else if (m.byId.has(id)) M.ui.storyMsg = `이미 있는 id: ${id}`;
    else { for (const x of st.data.scenes) if (x.after === sc.id) x.after = id; sc.id = id; M.ui.sceneId = id; }
  }
  Object.assign(sc, { brief: v('brief').trim(), who: v('who'), shape: v('shape'), gate: list(v('gate')), after: v('after') || null, leaves: list(v('leaves')), level: v('level') });
  if (v('owner')) sc.owner = v('owner'); else delete sc.owner;
  if (v('note').trim()) sc.note = v('note').trim(); else delete sc.note;
  M.store.saveStory(st);
}

// 끌어 놓기: 장면을 다른 자리 · 다른 줄기로. after 로 이어진 것은 이음을 다시 맺는다 (문턱의 낱말은 건드리지 않는다 — 끊기면 빨갛게 보인다)
function move(M, id, toKey, index) {
  const m = model(M), x = m.byId.get(id), to = m.stories.find((st) => keyOf(st) === toKey);
  if (!x || !to) return;
  const from = x.st, sc = x.sc, i = from.data.scenes.indexOf(sc);
  if (from === to && (index === i || index === i + 1)) return;
  const next = from.data.scenes[i + 1], linked = !!sc.after;
  if (next && next.after === sc.id) next.after = from.data.scenes[i - 1]?.id ?? null;
  from.data.scenes.splice(i, 1);
  const at = from === to && index > i ? index - 1 : index;
  const p = to.data.scenes[at - 1], n = to.data.scenes[at];
  if (linked) sc.after = p?.id ?? null;
  if (n && linked && n.after === (p?.id ?? null) && p) n.after = sc.id;
  to.data.scenes.splice(at, 0, sc);
  M.ui.sceneId = sc.id;
  if (from !== to) M.store.saveStory(from);
  M.store.saveStory(to);
}

export const storyView = {
  html(M) {
    const m = model(M), S = m.S;
    const packs = [...new Set([...S.owners.map((o) => o.pack), ...m.stories.map((s) => s.pack)])].filter((p) => !p.startsWith('_'));
    const head = `<div class="mk-lane-h" style="grid-column:1"></div>${Array.from({ length: m.cols }, (_, c) => {
      const gates = [...new Set(m.all.filter((x) => m.rank.get(x.sc) === c).flatMap((x) => (x.sc.gate ?? []).filter((g) => !g.startsWith('prev:'))))];
      return `<div class="mk-col-h" style="grid-column:${c + 2}"><b>${c + 1}</b>${gates.map((g) => `<span class="a-mono">${esc(g)}</span>`).join('')}</div>`; }).join('')}`;
    const rows = m.lanes.map((lane) => `<div class="mk-lane" style="grid-column:1 / -1"><span>${esc(lane)}</span></div>` + m.stories.filter((st) => (st.data.lane || 'main') === lane).map((st) => `
      <div class="mk-strip" data-story="${esc(keyOf(st))}" style="grid-template-columns:subgrid;grid-column:1 / -1">
        <button class="mk-strip-h ${m.story === st && !m.sel ? 'is-on' : ''}" data-act="story" data-story="${esc(keyOf(st))}" style="grid-column:1">
          <b>${esc(st.data.title || st.data.id)}</b><span class="a-faint a-mono">${esc(keyOf(st))}</span><span class="mk-outline">${esc(st.data.outline ?? '')}</span></button>
        ${st.data.scenes.map((sc, i) => sceneCard(M, m, { sc, st, i })).join('')}
        <button class="mk-add" data-act="add-scene" data-story="${esc(keyOf(st))}" style="grid-column:${(st.data.scenes.length ? m.rank.get(st.data.scenes.at(-1)) + 1 : 0) + 2}">+ 장면</button>
      </div>`).join('')).join('');
    const broken = m.all.reduce((n, x) => n + (x.sc.gate ?? []).filter((g) => g.startsWith('prev:') && !m.leavers.has(g.slice(5))).length, 0);
    return `<div class="mk-story">
      <div class="mk-story-main">
        <div class="mk-top">
          <div class="mk-stats"><span><b>${m.stories.length}</b> 줄기</span><span><b>${m.all.length}</b> 장면</span><span class="${broken ? 'is-bad' : ''}"><b>${broken}</b> 끊긴 이음</span></div>
          <span class="mk-grow"></span>
          <select class="a-select" data-k="new-pack">${packs.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
          <input class="a-input a-mono" data-k="new-id" data-enter="add-story" placeholder="새 줄기 id (영어)" spellcheck="false" size="18">
          <button class="a-btn" data-act="add-story">줄기 만들기</button>
        </div>
        ${M.ui.storyMsg && !m.sel ? `<div class="mk-warn">${esc(M.ui.storyMsg)}</div>` : ''}
        <div class="mk-board-wrap" data-scroll="board">${m.stories.length ? `<div class="mk-board" style="--cols:${m.cols + 1};grid-template-columns:230px repeat(${m.cols + 1}, 250px)">${head}${rows}</div>` : '<div class="mk-empty">줄기가 없습니다 — 위에서 id 를 적고 "줄기 만들기"</div>'}</div>
      </div>
      <aside class="mk-story-side" data-scroll="sform">${m.sel ? sceneForm(M, m) : m.story ? storyForm(M, m) : '<div class="mk-empty">장면이나 줄기를 누르면 여기서 고칩니다</div>'}</aside>
    </div>`;
  },
  input(M, t, final) {
    if (!t.dataset.f) return;
    const root = t.closest('.mk-story-side');
    clearTimeout(timer);
    if (final) save(M, root); else if (t.dataset.f !== 'id') timer = setTimeout(() => save(M, root), 600);
  },
  act(M, a, t) {
    const m = model(M);
    if (a === 'scene') return M.go('story', { sceneId: t.dataset.scene, storyMsg: '' });
    if (a === 'story') return M.go('story', { sceneId: null, storyKey: t.dataset.story, storyMsg: '' });
    if (a === 'to-pick') { const c = m.cells.find((x) => x.scene === m.sel?.sc.id); return c ? M.go('pick', { cellKey: c.key, touched: new Set(), focusId: null, batch: '', show: 'draft' }) : null; }
    if (a === 'add-story') {
      const row = t.closest('.mk-top'), id = row.querySelector('[data-k="new-id"]').value.trim(), pack = row.querySelector('[data-k="new-pack"]').value;
      if (!ID.test(id)) return M.go('story', { storyMsg: `줄기 id 는 소문자 · 숫자 · 밑줄 (${id || '비었음'})` });
      if (m.stories.some((st) => keyOf(st) === `${pack}/${id}`)) return M.go('story', { storyMsg: `이미 있는 줄기: ${pack}/${id}` });
      const st = { pack, data: { id, title: '', lane: 'main', outline: '', scenes: [] } };
      M.store.saveStory(st);
      return M.go('story', { sceneId: null, storyKey: keyOf(st), storyMsg: '' });
    }
    if (a === 'add-scene') {
      const st = m.stories.find((s) => keyOf(s) === t.dataset.story); if (!st) return;
      let n = st.data.scenes.length + 1, id; do { id = `${st.data.id}_${n++}`; } while (m.byId.has(id));
      const last = st.data.scenes.at(-1);
      st.data.scenes.push({ id, brief: '', who: '', shape: 'scene', gate: [], after: null, leaves: [], ...(last?.owner ? { owner: last.owner } : {}), level: last?.level ?? 'general' });
      M.store.saveStory(st);
      return M.go('story', { sceneId: id, storyMsg: '' });
    }
    if (a === 'del-scene' && m.sel) {
      const { sc, st } = m.sel;
      M.confirm({ title: '장면 지우기', okLabel: '지우기', danger: true, html: `<p>장면 <b class="a-mono">${esc(sc.id)}</b> 을 줄기에서 지웁니다. 이미 만든 후보 카드는 그대로 남습니다.</p>` }).then((ok) => {
        if (!ok) return;
        const i = st.data.scenes.indexOf(sc);
        for (const x of st.data.scenes) if (x.after === sc.id) x.after = st.data.scenes[i - 1]?.id ?? null;
        st.data.scenes.splice(i, 1); M.ui.sceneId = null; M.ui.storyKey = keyOf(st);
        M.store.saveStory(st);
      });
    }
  },
  drag(M, e) {
    const card = e.target.closest?.('.mk-scene'), strip = e.target.closest?.('.mk-strip');
    if (e.type === 'dragstart') { if (!card) return; dragging = card.dataset.scene; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragging); card.classList.add('is-drag'); return; }
    if (e.type === 'dragend') { dragging = null; for (const n of e.currentTarget.querySelectorAll('.is-drag,.is-over,.is-before,.is-after')) n.classList.remove('is-drag', 'is-over', 'is-before', 'is-after'); return; }
    if (!dragging || !strip) return;
    const clear = () => { for (const n of e.currentTarget.querySelectorAll('.is-over,.is-before,.is-after')) n.classList.remove('is-over', 'is-before', 'is-after'); };
    if (e.type === 'dragleave') return;
    e.preventDefault();
    const before = card ? e.clientX < card.getBoundingClientRect().left + card.offsetWidth / 2 : false;
    if (e.type === 'dragover') { clear(); strip.classList.add('is-over'); if (card && card.dataset.scene !== dragging) card.classList.add(before ? 'is-before' : 'is-after'); return; }
    if (e.type === 'drop') {
      const st = M.S.stories.find((s) => keyOf(s) === strip.dataset.story); if (!st) return;
      const i = card ? st.data.scenes.findIndex((x) => x.id === card.dataset.scene) : -1;
      const id = dragging; dragging = null;
      move(M, id, strip.dataset.story, i < 0 ? st.data.scenes.length : before ? i : i + 1);
    }
  },
};
