// 가 — 일감 표 (첫 화면). 줄 = 카테고리(갈래별) · 줄거리 장면 / 칸 = 맥락 × 수위.
// 칸마다 있는 것 / 원하는 것 · 고르기를 기다리는 후보 수. 칸을 누르면 고르기, 줄 이름을 누르면 주문서. 폰에서는 목록 꼴.
import { esc } from './ui.js';
import { LEVELS, WHO, whoLabel } from './store.js';

const prevLabel = (c) => c.prev.join('+') || '-';
const colKey = (c) => `${prevLabel(c)}|${c.level}`;
export const rowKey = (c) => (c.kind === 'story' ? `story|${c.scene}` : `daily|${c.owner}|${c.category}`);

function model(M) {
  const cells = M.store.cells();
  const daily = cells.filter((c) => c.kind !== 'story'), story = cells.filter((c) => c.kind === 'story');
  // 칸의 줄: 무관(-)이 먼저, 그다음 나온 차례 · 수위는 정해진 차례
  const prevs = [...new Set(daily.map(prevLabel))].sort((a, b) => (a === '-' ? -1 : b === '-' ? 1 : 0));
  const cols = prevs.map((p) => ({ prev: p, levels: LEVELS.filter((l) => daily.some((c) => prevLabel(c) === p && c.level === l)) }));
  const rows = new Map();
  for (const c of daily) {
    const k = rowKey(c);
    if (!rows.has(k)) { const o = M.store.orderOf(c.owner, c.category); rows.set(k, { key: k, owner: c.owner, category: c.category, name: o?.name ?? c.name ?? '', who: o?.who || c.who || '', order: !!o || (c.ordered && !!c.brief), brief: o?.brief ?? c.brief ?? '', cells: new Map() }); }
    rows.get(k).cells.set(colKey(c), c);
  }
  const groups = new Map();
  for (const r of rows.values()) { const g = r.order ? (r.who || '?') : ''; (groups.get(g) ?? groups.set(g, []).get(g)).push(r); }
  const rank = (g) => (g === '' ? 99 : g === '?' ? 98 : WHO.findIndex((w) => w.id === g));
  const sorted = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [, rs] of sorted) rs.sort((a, b) => `${a.owner}/${a.category}`.localeCompare(`${b.owner}/${b.category}`));
  // 없는 이름: 주문은 있는데 그 주인의 st/ 에 없는 카테고리 (화면은 이름을 만들지 않는다 — 빨갛게 보여 주고 끝). 나무를 읽는 길에서만 안다
  const ghosts = Object.entries(M.S.orders).flatMap(([owner, d]) => { const o = M.S.owners.find((x) => x.id === owner); return o?.patterns ? Object.keys(d.orders ?? {}).filter((cat) => !o.categories.some((c) => c.id === cat)).map((cat) => ({ owner, cat })) : []; });
  const problems = M.S.plan.problems.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).filter((p) => !ghosts.some((g) => p.includes(`\`${g.cat}\``) && p.includes('폴더에 없음')));
  return { cells, cols, groups: sorted, story, owners: new Set(daily.map((c) => c.owner)), ghosts, problems };
}
const tip = (c) => `${c.kind === 'story' ? c.scene : c.category} · ${c.prev.join(' + ') || '무관'} · ${c.level}\n살아 있음 ${c.have.live} · 고름 ${c.have.picked}${c.hand ? ` · 손으로 쓴 ST ${c.hand}` : ''} · 후보 ${c.waiting} · 버림 ${c.have.dropped} / 원하는 것 ${c.want ?? 0}`;
const tone = (c) => (!c.want ? 'is-zero' : c.missing ? 'is-missing' : 'is-full');

function cellHtml(c) {
  if (!c) return '<td class="mk-c is-none"></td>';
  return `<td class="mk-c"><button class="mk-cell ${tone(c)}" data-act="cell" data-key="${esc(c.key)}" title="${esc(tip(c))}">
    <span class="mk-num"><b>${c.alive}</b><i>/ ${c.want ?? 0}</i></span>
    <span class="mk-bar"><span style="width:${c.want ? Math.min(100, Math.round(c.alive / c.want * 100)) : 0}%"></span></span>
    ${c.waiting ? `<span class="mk-draft" title="고르기를 기다리는 후보">후보 ${c.waiting}</span>` : '<span class="mk-draft is-none"></span>'}</button></td>`;
}
// 폰: 칸 하나 = 누르는 조각 하나
const chip = (c) => `<button class="mk-pchip ${tone(c)} ${c.waiting ? 'has-draft' : ''}" data-act="cell" data-key="${esc(c.key)}">
  <span class="mk-pchip-k">${c.prev.length ? esc(c.prev.join('+')) + ' · ' : ''}${esc(c.level)}</span><b>${c.alive}</b><i>/ ${c.want ?? 0}</i>${c.waiting ? `<span class="mk-draft">후보 ${c.waiting}</span>` : ''}</button>`;

export const planView = {
  html(M) {
    const { cells, cols, groups, story, owners, ghosts, problems } = model(M);
    const S = M.S, sel = M.ui.rows;
    const missCells = cells.filter((c) => c.missing).length, missCards = cells.reduce((n, c) => n + c.missing, 0), drafts = cells.reduce((n, c) => n + c.waiting, 0);
    const canGen = S.caps.fill && !S.busy, nFill = cells.filter(M.store.fillable).length;
    const top = `<div class="mk-top">
        <div class="mk-stats"><span><b>${missCells}</b> 칸이 모자라요</span><span><b>${missCards}</b>장이 모자라요</span><span class="${drafts ? 'is-hot' : ''}"><b>${drafts}</b> 기다리는 카드</span></div>
        <span class="mk-grow"></span>
        ${S.caps.fill ? `<button class="a-btn a-primary" data-act="fill-all" ${canGen && nFill ? '' : 'disabled'} title="주문이 있는 모자란 칸을 전부 채운다 (그록 API · 돈이 든다)">모자란 칸 채우기 — 전부</button>
        ${M.narrow ? '' : `<button class="a-btn" data-act="fill-sel" ${canGen && sel.size ? '' : 'disabled'}>고른 줄만 (${sel.size})</button>`}` : ''}
        ${drafts ? '<button class="a-btn" data-act="pick-next">고르러 가기</button>' : ''}
      </div>
      ${ghosts.length ? `<div class="mk-problems">${ghosts.map((g) => `<div class="is-bad">없는 카테고리에 주문이 있음: <span class="a-mono">${esc(g.cat)}</span> <span class="a-faint">(${esc(g.owner)})</span></div>`).join('')}</div>` : ''}
      ${problems.length ? `<details class="mk-fold"><summary>문제 ${problems.length}</summary><div class="mk-problems">${problems.map((p) => `<div>${esc(p)}</div>`).join('')}</div></details>` : ''}`;
    const gname = (g) => (g === '' ? '주문 없음' : g === '?' ? '갈래를 안 고른 주문' : whoLabel(g));
    if (M.narrow) {
      return `<div class="mk-scroll" data-scroll="plan"><div class="mk-pad">${top}
        ${groups.map(([g, rs]) => `<h3 class="mk-h">${esc(gname(g))} <span class="a-faint">${rs.length}</span></h3>${rs.map((r) => `<div class="mk-prow">
          <button class="mk-link" data-act="order" data-owner="${esc(r.owner)}" data-cat="${esc(r.category)}">${r.name ? `<b class="mk-name">${esc(r.name)}</b> ` : ''}<span class="a-mono">${esc(r.category)}</span></button>
          <div class="mk-brief ${r.order ? '' : 'is-none'}">${r.order ? esc(r.brief) : '주문 없음'}</div>
          <div class="mk-pchips">${[...r.cells.values()].map(chip).join('')}</div></div>`).join('')}`).join('')}
        ${story.length ? `<h3 class="mk-h">줄거리</h3>${story.map((c) => `<div class="mk-prow"><button class="mk-link a-mono" data-act="scene" data-scene="${esc(c.scene)}">${esc(c.scene)}</button><div class="mk-brief">${esc(c.brief ?? '')}</div><div class="mk-pchips">${chip(c)}</div></div>`).join('')}` : ''}
      </div></div>`;
    }
    const head = `<tr><th class="mk-rh" rowspan="2">카테고리</th>${cols.map((c) => `<th colspan="${c.levels.length}" class="mk-ph">${c.prev === '-' ? '무관' : esc(c.prev)}</th>`).join('')}</tr>
      <tr>${cols.map((c) => c.levels.map((l) => `<th class="mk-lh">${esc(l)}</th>`).join('')).join('')}</tr>`;
    const ncol = cols.reduce((n, c) => n + c.levels.length, 0) + 1;
    const body = groups.map(([g, rs]) => `<tr class="mk-group"><td colspan="${ncol}">${esc(gname(g))}<span class="a-faint"> ${rs.length}</span></td></tr>` + rs.map((r) => `
      <tr><td class="mk-rh"><label class="mk-rowsel"><input type="checkbox" data-row="${esc(r.key)}" ${sel.has(r.key) ? 'checked' : ''}></label>
        <button class="mk-link" data-act="order" data-owner="${esc(r.owner)}" data-cat="${esc(r.category)}" title="주문서에서 열기">${r.name ? `<b class="mk-name">${esc(r.name)}</b> ` : ''}<span class="a-mono">${esc(r.category)}</span>${owners.size > 1 ? `<span class="a-faint"> ${esc(r.owner)}</span>` : ''}</button>
        <div class="mk-brief ${r.order ? '' : 'is-none'}">${r.order ? esc(r.brief) || '<i>주문에 글이 없음</i>' : '주문 없음'}</div></td>
        ${cols.map((c) => c.levels.map((l) => cellHtml(r.cells.get(`${c.prev}|${l}`))).join('')).join('')}</tr>`).join('')).join('');
    const gateOf = (c) => (c.gate ?? c.prev.map((p) => `prev:${p}`));
    const storyRows = story.map((c) => `<tr><td class="mk-rh"><label class="mk-rowsel"></label>
        <button class="mk-link" data-act="scene" data-scene="${esc(c.scene)}" title="줄거리 표에서 열기"><span class="a-mono">${esc(c.scene)}</span></button>
        <div class="mk-brief">${esc(c.brief ?? '')}</div></td>
      <td class="mk-gate">${gateOf(c).length ? gateOf(c).map((p) => `<span class="mk-chip">${esc(p)}</span>`).join(' ') : '<span class="a-faint">—</span>'}</td>
      <td class="mk-lv">${esc(c.level)}</td>${cellHtml(c)}</tr>`).join('');
    return `<div class="mk-scroll" data-scroll="plan"><div class="mk-pad">${top}
      ${groups.length ? `<table class="mk-plan"><thead>${head}</thead><tbody>${body}</tbody></table>` : '<div class="mk-empty">일감이 없습니다 — 주문서에서 카테고리에 주문을 적으면 여기에 칸이 생깁니다</div>'}
      ${story.length ? `<h3 class="mk-h">줄거리</h3><table class="mk-plan is-story"><thead><tr><th class="mk-rh">장면</th><th>문턱</th><th>수위</th><th class="mk-lh">후보 → 하나</th></tr></thead><tbody>${storyRows}</tbody></table>` : ''}
    </div></div>`;
  },
  input(M, t) {
    if (!t.dataset.row) return;
    if (t.checked) M.ui.rows.add(t.dataset.row); else M.ui.rows.delete(t.dataset.row);
    M.redraw();
  },
  act(M, a, t) {
    const pick = (key) => M.go('pick', { cellKey: key, touched: new Set(), focusId: null, batch: '', show: 'draft' });
    if (a === 'cell') return pick(t.dataset.key);
    if (a === 'pick-next') return pick(null);
    if (a === 'order') return M.go('orders', { owner: t.dataset.owner, cat: t.dataset.cat });
    if (a === 'scene') return M.go('story', { sceneId: t.dataset.scene });
    if (a === 'fill-all' || a === 'fill-sel') return askFill(M, a === 'fill-all' ? null : M.store.cells().filter((c) => M.ui.rows.has(rowKey(c))));
  },
};

// 채우기 앞의 확인 — 무엇을 몇 장 돌릴지 보여 준다 (돈이 든다). cells 가 없으면 전부
export function askFill(M, cells) {
  const list = (cells ?? M.store.cells()).filter(M.store.fillable);
  if (!list.length) return;
  const skipped = cells ? cells.filter((c) => c.missing && !M.store.fillable(c)).length : 0;
  const est = M.store.estimate(list);
  M.confirm({ title: '모자란 칸 채우기', okLabel: `채우기 — ${est.cards}장 · 약 $${est.usd.toFixed(2)}`,
    html: `<p>그록 API 로 후보를 만든다 — <b>${est.cells}칸 · ${est.cards}장 · 대략 $${est.usd.toFixed(2)}</b> <span class="a-faint">(장당 약 $0.0025)</span>.
      ${M.S.caps.deferred ? '대기열에 넣으면 저장소의 자동 작업이 채운다 — 몇 분 뒤 다시 읽으면 후보가 와 있다.' : `진행은 ${M.env.openJobs ? '작업 패널에' : '돌리기 화면에'}.`}</p>
      <table class="a-table mk-fill">${list.map((c) => `<tr><td class="a-mono">${esc(c.category)}</td><td>${esc(c.prev.join('+') || '무관')}</td><td>${esc(c.level)}</td><td class="mk-r">모자람 ${c.missing}</td></tr>`).join('')}</table>
      <p class="a-faint">칸마다 모자란 것의 세 배를 청한다 (한 번에 12장까지) — 셋에 하나쯤 건진다고 보고.${skipped ? ` 주문이 없거나 줄거리 장면인 ${skipped}칸은 건너뛴다.` : ''}</p>` })
    .then((ok) => { if (ok) M.store.fill(cells ? list : null); });
}
