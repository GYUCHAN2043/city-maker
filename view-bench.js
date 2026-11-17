// 작업대 (D-053 · 넘김-3) — 첫 화면. 대상 → 패턴 → 카테고리 → ST · 상세. 왼쪽에서 고르면 오른쪽이 걸러진다.
// 꼴과 흐름은 견본(docs/maker-3/st-bench-견본.html)을 따른다. 속은 진짜로:
//   데이터 = backends.js 의 bench(이름) · benchSt(id) · readLib/saveLib · queue (색인 · 명령 → 없으면 가짜 응답)
//   시뮬레이션 = runner.js (갈아 끼울 수 있는 한 겹) · 만들기 = ai.js (바로 부름 · 대기열)
// 화면은 내용을 모른다 — 본문은 받은 그대로 보여 준다. 없는 조건을 지어내지 않는다(없으면 정보 추가 요청).
// 이 화면은 자기 DOM 을 들고 있다(입력 · 스크롤을 잃지 않게) — app.js 가 다시 그려도 같은 판을 다시 붙인다.
import { esc } from './ui.js';
import { BENCH } from './backends.js';
import { createRunner } from './runner.js';
import { createAi, aiKey, aiModel, targetText } from './ai.js';
import { cardHtml } from './bubbles.js';

const ROLES = { guest: '손님', staff: '종업원', boss: '사장' };
const STATUS = { live: '게임에 있음', picked: '게임에 넣는 중', draft: '소설 (고르기 전)', checked: '소설 (고르기 전)', brief: 'brief', dropped: '버림', new: '방금 만듦' };
const ID = /^[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)?$/;
const COLOR = { red: 'var(--fx-red)', rose: 'var(--fx-rose)', dim: 'var(--mute)', brass: 'var(--brass)', white: 'var(--ink)' };
const VARS = { me: '리나', guest_name: '(손님 이름)', table: '(테이블)', party: '(일행)' };

let B = null;                          // 판 하나 (모든 화면이 같이 씀)

export const benchView = {
  html: () => '<div class="mkb-host"></div>',
  after(M, body) {
    if (!B || B.backend !== M.store.backend) B = createBench(M);
    B.M = M;
    body.querySelector('.mkb-host').replaceWith(B.el);
    B.setNarrow(M.narrow);
    B.refreshTop();
  },
  key: () => false,
};
export const benchFor = () => B;      // 시험 · 콘솔

function createBench(M) {
  const store = M.store, backend = store.backend;
  const el = document.createElement('div');
  el.className = 'mkb';
  const S = {
    lib: null, fake: [], loading: true, err: '',
    T: { f: { role: 'guest', c: [] }, t: { role: 'staff', c: [] } }, side: 'f', kind: '',
    pat: null, cat: null, st: null, showNo: false,
    q: { info: '', pat: '', cat: '', st: '' }, sugg: null, msg: '',
    targets: [], toolPats: [], toolCats: [], owner: 'tavern/Jobs/tavern',
    one: {}, sim: null, briefs: null, made: [], redo: {}, newCat: null, usd: 0, models: [], narrow: false, col: 0,
  };
  const ai = createAi({ backend, getPrompts: () => S.lib?.prompts, onCost: (u) => { S.usd += u; drawTop(); }, onNote: (m) => { S.msg = m; drawDetail(); } });

  el.innerHTML = `<div class="mkb-wrap">
    <div class="mkb-top"><h1>ST 작업대</h1><div class="mkb-line" data-r="line"></div></div>
    <section class="target" aria-label="대상">
      <div class="trow">
        <div class="slot" data-side="f" tabindex="0"><div class="who"><span class="lab">누가</span><span class="roles" data-side="f"></span></div><div class="chips" data-r="chips-f"></div></div>
        <div class="arrow">→</div>
        <div class="slot" data-side="t" tabindex="0"><div class="who"><span class="lab">누구에게</span><span class="roles" data-side="t"></span></div><div class="chips" data-r="chips-t"></div></div>
      </div>
      <div class="nl"><input data-q="nl" placeholder="말로 정하기 — 예: 호색한 손님이 서빙 중인 종업원에게" aria-label="대상을 말로 정하기"><button class="btn" data-x="match">맞는 정보 찾기</button><button class="btn" data-x="clear">비우기</button></div>
      <div class="sugg" data-r="sugg"></div>
      <div class="presets" data-r="presets"></div>
    </section>
    <div class="legend"><span><span class="tag fit">딱 맞음</span> 그 조건을 쓰는 것</span><span>보통 글씨 = 가능함 (어긋나지 않음)</span><span style="opacity:.5">흐림 = 안 맞음</span>
      <label><input type="checkbox" data-x="showNo"> 안 맞는 것도 보기</label>
      <span class="mkb-grow"></span><span class="seg" role="group" aria-label="뷰"><button class="on" title="표형 뷰">표</button><button disabled title="노드형 뷰 — 표형이 굳은 뒤 (넘김-3 3절)">노드</button></span></div>
    <div class="cols" data-r="cols">
      <section class="col info"><header><div class="h"><span data-r="lt">정보 라이브러리</span> <small data-r="infoN"></small></div>
        <div class="seg sm"><button data-x="left" data-v="info" class="on">정보</button><button data-x="left" data-v="targets">대상</button></div>
        <input data-q="info" placeholder="찾기" aria-label="정보 찾기"><div class="kinds" data-r="kinds"></div></header><div class="list" data-r="info"></div></section>
      <section class="col pat"><header><div class="h">패턴 <small data-r="patN"></small></div><input data-q="pat" placeholder="말로 찾거나 새로 만들기" aria-label="패턴 찾기"></header><div class="list" data-r="pat"></div></section>
      <section class="col cat"><header><div class="h">카테고리 <small data-r="catN"></small></div><input data-q="cat" placeholder="말로 찾거나 새로 만들기" aria-label="카테고리 찾기"></header><div class="list" data-r="cat"></div></section>
      <section class="col st"><header><div class="h">ST <small data-r="stN"></small></div><input data-q="st" placeholder="찾기" aria-label="ST 찾기"></header><div class="list" data-r="st"></div></section>
      <section class="col det"><header><div class="h">상세 <small data-r="crumb"></small></div></header><div class="detail" data-r="detail"></div></section>
    </div>
    <nav class="mkb-dots" data-r="dots" aria-label="칸"></nav>
  </div>`;
  const R = (k) => el.querySelector(`[data-r="${k}"]`);
  S.left = 'info';

  // ── 라이브러리 읽기
  async function load() {
    S.loading = true; S.err = ''; draw();
    try {
      const got = await Promise.all(BENCH.map((n) => backend.bench(n)));
      S.lib = Object.fromEntries(BENCH.map((n, i) => [n, got[i].data]));
      S.fake = BENCH.filter((n, i) => got[i].fake);
      S.lib.infoById = new Map((S.lib.info?.info ?? []).map((i) => [i.id, i]));
      S.lib.catById = new Map((S.lib.categories ?? []).map((c) => [c.id, c]));
      const [tg, tp, tc] = await Promise.all([backend.readLib('_lib/targets.json'), backend.readLib(`${S.owner}/patterns.json`), backend.readLib(`${S.owner}/categories.json`)]);
      // 저장된 대상: Cards/_lib/targets.json (화면이 쓴다) — 아직 없으면 견본의 것으로 시작
      S.targets = tg?.targets ?? (await backend.bench('targets').then((r) => r.data?.targets ?? [], () => []));
      S.toolPats = tp?.patterns ?? []; S.toolCats = tc?.categories ?? [];
    } catch (e) { S.err = `작업대를 읽지 못했습니다 — ${e.message}`; }
    S.loading = false; draw();
  }

  // ── 이름 · 조건
  const info = (id) => S.lib.infoById.get(id) ?? { id, name: id, kind: '', who: 'any', about: '', levels: false, level_names: [] };
  const lvName = (i, n) => (i.level_names?.[n - 1] ?? S.lib.info?.level_names?.[n - 1] ?? n);
  const idOf = (c) => (typeof c === 'string' ? c : c.id);
  const nOf = (c) => (typeof c === 'string' ? null : c.n ?? null);
  const cname = (id) => cats().find((c) => c.id === id)?.name ?? id;
  const short = (id) => cname(id).replace(/ \(.*\)$/, '');
  const condText = (list) => list.map((c) => info(idOf(c)).name + (nOf(c) && info(idOf(c)).levels ? ` ${lvName(info(idOf(c)), nOf(c))} 이상` : '')).join(' · ');
  const excl = (a, b) => a !== b && (S.lib.info?.excl ?? []).some((g) => g.includes(a) && g.includes(b));
  const roleOk = (i, role) => i.who === 'any' || !i.who || i.who === role;

  // 맞춤: 0 안 맞음 · 1 가능 · 2 딱 맞음. x = { from, to, f:[{id,n}], t:[…] }
  function fit(x) {
    const T = S.T;
    if (x.from && T.f.role && x.from !== T.f.role) return 0;
    if (x.to && T.t.role && x.to !== T.t.role) return 0;
    const bad = (mine, theirs) => mine.some((m) => theirs.some((t) => excl(m.id, idOf(t))));
    if (bad(T.f.c, x.f ?? []) || bad(T.t.c, x.t ?? [])) return 0;
    if (!T.f.c.length && !T.t.c.length) return 1;
    // 대상의 조건을 모두 쓰고, 정도가 있으면 대상의 단계가 그것이 요구하는 단계 이상일 때 딱 맞음
    const uses = (mine, theirs) => mine.every((m) => { const o = theirs.find((t) => idOf(t) === m.id); return o && (!nOf(o) || !m.n || m.n >= nOf(o)); });
    return uses(T.f.c, x.f ?? []) && uses(T.t.c, x.t ?? []) ? 2 : 1;
  }

  // ── 패턴 · 카테고리 (게임의 것 + 도구가 만든 것)
  const pats = () => [...(S.lib.patterns ?? []), ...S.toolPats.map((p) => ({ ...p, src: 'tool', from: p.target?.from ?? p.from, to: p.target?.to ?? p.to, f: p.target?.f ?? p.f ?? [], t: p.target?.t ?? p.t ?? [] }))];
  const cats = () => [...(S.lib.categories ?? []), ...S.toolCats.filter((c) => !S.lib.catById.has(c.id)).map((c) => ({ ...c, src: 'tool', kids: [], counts: { live: 0, draft: 0, brief: 0 }, layers: [] }))];
  const catOf = (id) => cats().find((c) => c.id === id);
  const parentOf = (id) => catOf(id)?.parent ?? cats().find((c) => (c.kids ?? []).includes(id))?.id ?? null;
  const patsOf = (cid) => { const par = parentOf(cid); return pats().filter((p) => p.steps.includes(cid) || (par && p.steps.includes(par))); };
  const sts = () => [...S.made, ...(S.lib.sts ?? [])];
  const effStatus = (s) => store.S.pending?.[s.id] ?? s.status;
  const alive = (cid) => { const c = catOf(cid); return c?.counts ? c.counts.live : sts().filter((s) => s.cat === cid && s.status === 'live').length; };
  const waiting = (cid) => { const c = catOf(cid); return (c?.counts ? c.counts.draft + c.counts.brief : 0) + S.made.filter((s) => s.cat === cid).length; };
  const stFit = (s) => { if (S.made.includes(s)) return Math.max(1, fitRaw(s)); return fitRaw(s); };
  const fitRaw = (s) => { const ps = patsOf(s.cat); if (!ps.length) return fit({ f: s.f, t: s.t }); return Math.max(...ps.map((p) => fit({ from: p.from, to: p.to, f: [...p.f, ...s.f], t: [...p.t, ...s.t] }))); };
  const layerText = (c) => { const lc = c.layer_counts ?? {}; const ks = Object.keys(lc); return ks.length > 1 ? ks.map((k) => `${k === '_base' ? '공용' : k === 'tavern' ? '선술집' : k} ${lc[k]}`).join(' + ') : ''; };
  const stepHtml = (id) => { const k = catOf(id)?.kids ?? []; return `<span class="stp">${esc(short(id))}${k.length ? ` <i>(${k.map((c) => `${esc(short(c))} ${alive(c)}`).join(' / ')})</i>` : ` <i>${alive(id)}</i>`}</span>`; };
  const decideText = (c) => (c.decide === 'commit' ? '먼저 정하고 기다림' : { best: '가장 구체적인 것', random: '무작위', mix: '섞어서' }[c.pick] ?? c.pick ?? '');

  // ── 그리기
  function drawTop() {
    const cells = store.S.ready ? store.cells() : [];
    const wait = cells.reduce((n, c) => n + (c.waiting ?? 0), 0), miss = cells.reduce((n, c) => n + (c.missing ?? 0), 0);
    const models = S.models.length ? `<select data-x="model" aria-label="모델">${S.models.map((m) => `<option ${m === aiModel.get() ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : '';
    R('line').innerHTML = `<span>기다리는 카드 <b>${wait}</b></span><span>모자란 장 <b>${miss}</b></span>
      <span class="mkb-key">그록 열쇠 <b>${aiKey.has() ? '있다' : '없다'}</b>
        ${aiKey.has() ? `${models}<button class="btn sm" data-x="keyClear">열쇠 지우기</button>` : '<input type="password" data-q="key" placeholder="xAI 열쇠 붙여 넣기 — 이 브라우저에만" autocomplete="off"><button class="btn sm" data-x="keySet">넣기</button>'}
        ${S.usd ? `<span>쓴 돈 <b>$${S.usd.toFixed(4)}</b></span>` : ''}</span>
      ${S.fake.length ? `<span class="note" title="총괄의 색인 · 명령이 아직 없어 Tools/Maker/fixtures/bench 를 읽는다 — 생기면 스스로 바뀐다">가짜 응답: ${esc(S.fake.join(' · '))}</span>` : ''}`;
  }
  function drawTarget() {
    for (const side of ['f', 't']) {
      const T = S.T[side];
      el.querySelector(`.roles[data-side="${side}"]`).innerHTML = Object.entries(ROLES).map(([r, ko]) => `<button class="role${T.role === r ? ' on' : ''}" data-role="${r}" data-side="${side}">${ko}</button>`).join('');
      R(`chips-${side}`).innerHTML = T.c.length ? T.c.map((c) => { const i = info(c.id); return `<span class="chip">${esc(i.name)}${i.levels ? ` <button class="lvb" data-lv="${c.id}" data-side="${side}" title="정도 바꾸기 (4단계)">${esc(lvName(i, c.n ?? 2))} 이상</button>` : ''}<button data-rm="${c.id}" data-side="${side}" aria-label="빼기">×</button></span>`; }).join('')
        : '<span class="hint">조건 없음 — 왼쪽 정보 라이브러리에서 눌러 넣기</span>';
      el.querySelector(`.slot[data-side="${side}"]`).classList.toggle('act', S.side === side);
    }
    const sg = S.sugg;
    R('sugg').innerHTML = !sg ? '' : sg.picks.length
      ? `<span>이렇게 읽었습니다 — 눌러서 넣기:</span>${sg.picks.map((p) => `<button class="chip" data-sg="${p.id}" data-sgside="${p.side}">${p.side === 'f' ? '누가' : '누구에게'}: ${esc(info(p.id).name)}</button>`).join('')}`
      : `<span>라이브러리에서 맞는 정보를 못 찾았습니다.</span><button class="btn sm" data-x="request">정보 추가 요청 — "${esc(sg.missing)}"</button>`;
    R('presets').innerHTML = `<span>저장된 대상</span>${S.targets.map((t, i) => `<button class="btn sm" data-target="${i}">${esc(t.name)}</button>`).join('')}<button class="btn sm" data-x="saveTarget">+ 지금 대상 저장</button>`;
  }
  function drawInfo() {
    const lib = S.lib.info ?? { kinds: [], info: [] };
    el.querySelectorAll('[data-x="left"]').forEach((b) => b.classList.toggle('on', b.dataset.v === S.left));
    if (S.left === 'targets') {
      R('lt').textContent = '대상 라이브러리'; R('kinds').innerHTML = ''; R('infoN').textContent = `${S.targets.length}개`;
      const q = S.q.info;
      R('info').innerHTML = S.targets.filter((t) => !q || t.name.includes(q)).map((t) => `<button class="item" data-target="${S.targets.indexOf(t)}"><div class="t">${esc(t.name)}</div>
        <div class="s">${esc(condText(t.f))} ${ROLES[t.from] ?? ''} → ${esc(condText(t.t))} ${ROLES[t.to] ?? ''}</div></button>`).join('') || '<div class="empty">저장된 대상이 없습니다.</div>';
      return;
    }
    R('lt').textContent = '정보 라이브러리';
    R('kinds').innerHTML = `<button class="kind${S.kind === '' ? ' on' : ''}" data-kind="">전부</button>${lib.kinds.map((k) => `<button class="kind${S.kind === k ? ' on' : ''}" data-kind="${esc(k)}">${esc(k)}</button>`).join('')}`;
    const q = S.q.info, role = S.T[S.side].role; let html = '';
    for (const k of lib.kinds) {
      if (S.kind && S.kind !== k) continue;
      const rows = lib.info.filter((i) => i.kind === k && (!q || (i.name + i.about + (i.keys ?? []).join(' ')).includes(q)));
      if (!rows.length) continue;
      html += `<div class="grp">${esc(k)}</div>` + rows.map((i) => { const ok = roleOk(i, role), on = S.T[S.side].c.some((c) => c.id === i.id);
        return `<button class="item${on ? ' sel' : ''}${ok ? '' : ' no'}" data-info="${i.id}"><div class="t">${esc(i.name)}${i.levels ? '<span class="dots" title="정도 4단계"><i></i><i></i><i></i><i></i></span>' : ''} <span class="id">${esc(i.id)}</span></div>
          ${i.about ? `<div class="s">${esc(i.about)}</div>` : ''}${ok ? '' : `<div class="s">${ROLES[i.who] ?? i.who}에게만 붙는 정보</div>`}</button>`; }).join('');
    }
    R('info').innerHTML = html || '<div class="empty">맞는 정보가 없습니다.</div>';
    R('infoN').textContent = `${S.side === 'f' ? '누가' : '누구에게'} 쪽에 넣기`;
  }
  function drawPat() {
    const q = S.q.pat;
    const rows = pats().map((p) => ({ p, f: fit(p) })).filter((r) => (S.showNo || r.f > 0) && (!q || (r.p.name + r.p.id).includes(q))).sort((a, b) => b.f - a.f);
    let html = rows.map(({ p, f }) => `<button class="item${S.pat === p.id ? ' sel' : ''}${f === 0 ? ' no' : f === 1 ? ' maybe' : ''}" data-pat="${esc(p.id)}" data-fit="${f}">
      <div class="t">${esc(p.name)}${f === 2 ? '<span class="tag fit">딱 맞음</span>' : ''}${p.src === 'tool' ? '<span class="tag new">도구</span>' : ''} <span class="id">${esc(p.id)}</span></div>
      <div class="s">${p.f.length ? esc(condText(p.f)) + ' ' : ''}${ROLES[p.from] ?? ''} → ${p.t.length ? esc(condText(p.t)) + ' ' : ''}${ROLES[p.to] ?? ''}</div>
      <div class="steps">${p.steps.length ? p.steps.map(stepHtml).join('<span class="ar">›</span>') : '<span class="s">카테고리 없음</span>'}</div>
      ${p.raw_when?.length ? `<div class="s raw">${esc(p.raw_when.join(' · '))}</div>` : ''}</button>`).join('');
    if (q && !rows.length) html = `<div class="empty">맞는 패턴이 없습니다.</div><button class="item" data-x="newPat"><div class="t">+ 새 패턴 제안: ${esc(q)}</div><div class="s">지금 대상으로 만들고, 카테고리는 다음 칸에서 넣기</div></button>`;
    R('pat').innerHTML = html || '<div class="empty">이 대상에 맞는 패턴이 없습니다. 위에 말로 적어 새로 만들 수 있습니다.</div>';
    R('patN').textContent = `${rows.length}개`;
  }
  function catRow(c, i) {
    const a = alive(c.id), w = waiting(c.id), lay = layerText(c), dec = decideText(c);
    return `<button class="item${S.cat === c.id ? ' sel' : ''}" data-cat="${esc(c.id)}"><div class="t">${i != null ? `<span class="stepno">${i + 1}</span>` : ''}${esc(c.name ?? c.id)} <span class="id">${esc(c.id)}</span>${c.src === 'tool' ? '<span class="tag new">도구</span>' : ''}</div>
      <div class="s">ST ${a}${c.want ? ` / ${c.want}` : ''}${w ? ` · 기다리는 것 ${w}` : ''}${lay ? ` · <span class="layer" title="세상 공용 + 장소가 덧붙인 것">${esc(lay)}</span>` : ''}</div>
      ${c.about || dec ? `<div class="s">${c.about ? esc(c.about) + ' · ' : ''}${dec ? `고르기: ${esc(dec)}` : ''}</div>` : ''}</button>`;
  }
  function drawCat() {
    const q = S.q.cat, p = pats().find((x) => x.id === S.pat); let html = '';
    if (p) {
      html += `<div class="grp">${esc(p.name)}의 차례</div>` + (p.steps.length ? p.steps.map((id, i) => {
        const c = catOf(id) ?? { id, name: id };
        if (c.kids?.length) return `<div class="parent"><span class="stepno">${i + 1}</span><b>${esc(c.name)}</b> <span class="id">${esc(id)}</span>
          <div class="s"><b class="dec">${esc(decideText(c))}</b>${c.about ? ` — ${esc(c.about)}` : ''}</div></div>` + c.kids.map((k) => `<div class="kid">${catRow(catOf(k) ?? { id: k, name: k }, null)}</div>`).join('');
        return catRow(c, i);
      }).join('') : '<div class="empty">아직 카테고리가 없습니다.</div>');
      const inP = (cid) => p.steps.includes(cid) || (parentOf(cid) && p.steps.includes(parentOf(cid)));
      const rest = cats().filter((c) => !inP(c.id) && (!q || ((c.name ?? '') + c.id).includes(q)));
      html += `<div class="grp">라이브러리 — 누르면 이 패턴에 넣기${p.src === 'tool' ? '' : ' (게임의 패턴은 새 패턴으로 떠서)'}</div>` + rest.map((c) => `<button class="item maybe" data-addcat="${esc(c.id)}"><div class="t">+ ${esc(c.name ?? c.id)} <span class="id">${esc(c.id)}</span></div></button>`).join('');
    } else {
      html += '<div class="grp">전부 (패턴을 고르면 그 차례만)</div>' + cats().filter((c) => !q || ((c.name ?? '') + c.id).includes(q)).map((c) => catRow(c, null)).join('');
    }
    if (q && !cats().some((c) => ((c.name ?? '') + c.id).includes(q))) {
      html += `<button class="item" data-x="newCat"><div class="t">+ 새 카테고리 제안: ${esc(q)}</div><div class="s">id(영어)를 정해 만든다 — 이름은 표에서만 태어난다</div></button>`;
      if (S.newCat) html += `<div class="box"><b>새 카테고리</b><input data-q="newCatId" placeholder="id — 영어 소문자 · 예: hall/sigh" value="${esc(S.newCat.id)}"><div class="row"><button class="btn pri" data-x="newCatGo">만들기</button></div>${S.newCat.err ? `<div class="s bad">${esc(S.newCat.err)}</div>` : ''}</div>`;
    }
    R('cat').innerHTML = html;
    R('catN').textContent = p ? `${p.steps.length}걸음` : `${cats().length}개`;
  }
  function drawSt() {
    if (!S.cat) { R('st').innerHTML = '<div class="empty">카테고리를 고르면 그 안의 ST가 나옵니다.</div>'; R('stN').textContent = ''; return; }
    const q = S.q.st, order = { new: 0, brief: 1, draft: 2, checked: 2, picked: 3, live: 4, dropped: 5 };
    const rows = sts().filter((s) => s.cat === S.cat && (!q || s.title.includes(q))).map((s) => ({ s, f: stFit(s) })).filter((r) => S.showNo || r.f > 0)
      .sort((a, b) => (b.f - a.f) || (order[effStatus(a.s)] - order[effStatus(b.s)]));
    R('st').innerHTML = rows.map(({ s, f }) => { const st = effStatus(s);
      return `<button class="item${S.st === s.id ? ' sel' : ''}${f === 0 ? ' no' : ''}" data-st="${esc(s.id)}"><div class="t">${esc(s.title)}<span class="tag ${st}">${STATUS[st] ?? st}</span>${f === 2 ? '<span class="tag fit">딱 맞음</span>' : ''}</div>
        ${s.f.length || s.t.length ? `<div class="s">${esc(condText([...s.f, ...s.t]))}</div>` : ''}</button>`; }).join('') || '<div class="empty">이 대상에 맞는 ST가 없습니다. 오른쪽에서 더 만들 수 있습니다.</div>';
    R('stN').textContent = `${rows.length}개`;
  }

  // ── 상세: 대화 카드 · 시뮬레이션 · 고쳐 달라고 하기 · 만들기
  const fx = () => S.lib.look?.text_fx ?? {};
  function span(tag, txt) {
    const t = fx()[tag]; if (!t) return esc(txt);
    if (t.group) { const g = t.group, cs = [...txt]; return cs.map((ch, i) => span(g[Math.min(g.length - 1, Math.floor(i * g.length / cs.length))], ch)).join(''); }
    const st = (t.color && COLOR[t.color] ? `color:${COLOR[t.color]};` : '') + (t.size && t.size !== 1 ? `font-size:${t.size}em;` : '') + (t.color === 'red' ? 'font-weight:700;' : '');
    return `<span class="${t.anim && t.anim !== 'none' ? 'tx-' + t.anim : ''}" style="${st}" title="글자 연출: ${esc(tag)}">${esc(txt)}</span>`;
  }
  function fmt(text) {
    let out = '', open = null, last = 0, m; const re = /\{(\/?[a-z0-9_]*)(?::([^}]*))?\}/g; text = String(text ?? '');
    const put = (t) => { if (t) out += open ? span(open, t) : esc(t); };
    while ((m = re.exec(text))) {
      put(text.slice(last, m.index)); last = re.lastIndex; const n = m[1];
      if (m[2] != null) out += span(n, m[2]); else if (VARS[n]) out += esc(VARS[n]); else if (n === '' || n[0] === '/') open = null;
      else if (n === 'beat') out += '<span class="fxc" title="멈춤">…</span>'; else open = fx()[n] ? n : null;
    }
    put(text.slice(last)); return out;
  }
  const ACTS = () => S.lib.look?.acts ?? {};
  function fxChips(a) {
    const A = ACTS()[a.intent] ?? {}, f = A.fx ?? {}, c = [];
    if (f.stop) c.push(`멈칫 ${f.stop.sec}초${f.stop.lock ? ' · 못 걸음' : ''}`); if (f.shake) c.push(`화면 흔들림 ${f.shake === 'big' ? '크게' : '작게'}`);
    if (f.hitstop) c.push(`순간 정지 ${f.hitstop}초`); if (f.sfx) c.push(`소리 ${f.sfx}`);
    if (A.pop) c.push(`팝 ${A.pop}`); if (A.anim) c.push(`몸짓 ${A.anim}`); if (A.touch) c.push('닿음');
    if (A.holds) c.push(`붙잡고 있음 → ${(ACTS()[A.ends_by] ?? {}).ko ?? A.ends_by}로 풀림`);
    return c.map((x) => `<span class="fxc">${esc(x)}</span>`).join('');
  }
  const actLine = (a) => { const A = ACTS()[a.intent] ?? {}; return `<div class="stage">〔${esc(A.ko ?? a.intent)}${a.part ? ' · ' + esc(a.part) : ''}${a.what ? ' · ' + esc(a.what) : ''}〕 ${fxChips(a)}</div>`; };
  const roleKo = (r) => S.lib.look?.roles?.[r] ?? ROLES[r] ?? r;
  const miniOf = (a) => { const A = ACTS()[a?.intent] ?? {}; return A.input === 'hold' ? '마시기 판' : (A.mash || A.input === 'mash') ? '연타' : ''; };
  function optHtml(c, k) {
    const A = c.act ? ACTS()[c.act.intent] ?? {} : null, mg = c.act ? miniOf(c.act) : '';
    return `<${k != null ? `button class="opt" data-pickc="${k}"` : 'span class="opt"'}>${fmt(c.text)}${c.default ? ' <small>기본</small>' : ''}${c.adult ? ` <small>${esc(c.adult)}</small>` : ''}${A ? ` <small>→ ${esc(A.ko ?? c.act.intent)}${mg ? ` (${mg})` : ''}</small>` : ''}${c.if ? `<br><small>조건: ${esc(String(c.if))}</small>` : ''}</${k != null ? 'button' : 'span'}>`;
  }
  // 대화 카드: 손님은 왼쪽 · 리나의 선택은 오른쪽에 묶어서
  function dialogHtml(one) {
    return `<div class="bubs">${one.beats.map((b) => {
      let h = '';
      if (b.if) h += `<div class="stage">조건: <code>${esc(String(b.if))}</code></div>`;
      if (b.act) h += actLine(b.act);
      if (b.say) h += `<div class="bub${b.role === 'worker' || b.role === 'b' ? ' r' : b.role === 'chorus' ? ' c' : ''}"><small>${esc(roleKo(b.role))}${b.to ? ' → 자리에 대고' : ''}${b.pop ? ` · 팝 ${esc(b.pop)}` : ''}</small>${fmt(b.say)}</div>`;
      if (b.choices) h += `<div class="bub r"><small>리나의 선택${b.small ? ' · 작은 선택' : ''}</small><div class="opts">${b.choices.map((c) => optHtml(c, null)).join('')}</div></div>`;
      if (b.end) h += `<div class="stage">→ 끝: ${esc(b.end)}</div>`;
      return h;
    }).join('')}</div>`;
  }
  function simHtml() {
    const X = S.sim.state; let h = '<div class="simbox"><div class="hd"><span>시뮬레이션</span><span class="row"><button class="btn sm" disabled title="직전 상태로 들어가기 — D-055 의 조사 뒤 (넘김-3 2-5)">직전 상태로</button><button class="btn sm" data-sim="restart">처음부터</button><button class="btn sm" data-sim="close">닫기</button></span></div><div class="bubs">';
    for (const l of X.log) {
      if (l.t === 'say') h += (l.act ? actLine(l.act) : '') + (l.text ? `<div class="bub${l.role === 'worker' ? ' r' : ''}"><small>${esc(roleKo(l.role))}${l.pop ? ' · 팝 ' + esc(l.pop) : ''}</small>${fmt(l.text)}</div>` : '');
      if (l.t === 'pick') h += `<div class="bub r"><small>리나의 선택</small>${fmt(l.text)}</div>${l.act ? actLine(l.act) : ''}`;
      if (l.t === 'note') h += `<div class="stage">${l.kind === 'hold' ? `〔${esc(sipName(l.event))}을 마셨다 — 양 ${l.amount} · 취기가 오른다〕` : esc(l.text)}</div>`;
    }
    h += '</div>';
    const w = X.wait;
    if (w?.t === 'choice') h += `<div class="opts">${w.choices.map((c, k) => optHtml(c, k)).join('')}</div>${w.small ? '<div class="stage">작은 선택 — 대화창 없이 그 자리에서 고름. 시간이 지나면 기본으로.</div>' : ''}`;
    if (w?.t === 'cond') h += `<div class="mini"><b>조건 갈림</b><code>${esc(w.cond)}</code><div class="s">대상의 조건으로 정할 수 없는 것 — 골라서 이어 가기</div><div class="row"><button class="btn sm" data-sim="condY">참으로 치기</button><button class="btn sm" data-sim="condN">거짓으로 치기</button></div></div>`;
    if (w?.t === 'mini' && w.kind === 'hold') h += `<div class="mini"><b>마시기 판이 열린다</b><div>${esc(w.key ?? 'E')} 를 누르고 있는 길이로 얼마나 마시는지가 정해진다. 마신 만큼 취기가 오른다.</div><div class="row">${w.steps.map((s, k) => `<button class="btn sm" data-sip="${k}">${esc(sipName(s.event))} <small>${s.sec}초 · 양 ${s.amount}</small></button>`).join('')}</div></div>`;
    if (w?.t === 'mini' && w.kind === 'mash') h += `<div class="mini"><b>연타 — ${esc((ACTS()[w.act.intent] ?? {}).ko ?? w.act.intent)}</b><div>키를 연타해 겨룬다. 상대가 붙잡은 힘과 리나의 힘으로 맞춘다.</div><div class="row"><button class="btn sm" data-sim="mashY">성공</button><button class="btn sm" data-sim="mashN">실패</button></div></div>`;
    if (X.done) { const r = X.result ?? {};
      h += `<div class="endc"><b>끝: ${esc(X.done)}</b>${r.remember?.length ? `<div>남는 기억</div>${r.remember.map((x) => `<code>${esc(x)}</code>`).join('')}` : ''}${r.leave ? `<div>남는 낱말</div><code>${esc(JSON.stringify(r.leave))}</code>` : ''}${r.state ? `<div>바뀌는 값</div><code>${esc(JSON.stringify(r.state))}</code>` : ''}${r.emit ? `<div>알리는 사건</div><code>${esc(Object.keys(r.emit).join(' · '))}</code>` : ''}${!r.remember && !r.state && !r.emit && !r.leave ? '<div>따로 남기는 것 없음 (표준 끝맺음이 있으면 엔진이 채운다)</div>' : ''}</div>`; }
    return h + '</div>';
  }
  const sipName = (e) => ({ 'drink.sip': '한 모금', 'drink.half': '반 잔', 'drink.glass': '한 잔', 'drink.bottoms_up': '원샷' }[e] ?? e);
  // 대상의 조건으로 조건 갈림을 아는 만큼 정한다 — 낱말이 대상의 정보 id 와 같으면 참 (모르면 사용자에게)
  const condFromTarget = (text) => { const all = [...S.T.f.c, ...S.T.t.c].map((c) => c.id); const t = String(text), w = t.match(/[a-z_]+/g) ?? []; if (!w.some((x) => all.includes(x))) return undefined; return /^\s*\[?\s*"?!/.test(t) ? false : true; };

  async function oneOf(id) {
    if (S.one[id] !== undefined) return S.one[id];
    const made = S.made.find((s) => s.id === id);
    if (made) return (S.one[id] = made.one ?? null);
    S.one[id] = null;
    const r = await backend.benchSt(id).catch(() => ({ data: null }));
    S.one[id] = r.data;
    drawDetail();
    return r.data;
  }

  function drawDetail() {
    const box = R('detail'); let html = '';
    const s = S.st && sts().find((x) => x.id === S.st);
    R('crumb').textContent = [S.pat && pats().find((p) => p.id === S.pat)?.name, S.cat && cname(S.cat), s?.title].filter(Boolean).join(' › ');
    if (s) {
      const st = effStatus(s), one = S.one[s.id];
      html += `<h2>${esc(s.title)}</h2><div class="meta"><span class="tag ${st}">${STATUS[st] ?? st}</span><span>${esc(cname(s.cat))}</span><span class="id">${esc(s.id)}</span>${s.src === 'hand' ? '<span>손으로 쓴 ST</span>' : s.src === 'base' ? '<span>세상 공용</span>' : ''}<span>수위 ${esc(s.level ?? '')}</span></div>`;
      if (st === 'brief') html += `<div class="box"><b>brief</b><div>${esc(s.brief ?? one?.brief ?? s.title)}</div><div class="row"><button class="btn pri" data-x="toNovel">소설로 만들기</button></div></div>`;
      else if (one === undefined) { oneOf(s.id); html += '<div class="empty">읽는 중…</div>'; }
      else if (one?.beats?.length) html += dialogHtml(one);
      else if (s.fields) html += `<div class="cardv">${cardHtml({ id: s.id, fields: s.fields, order: Object.keys(s.fields), shape: s.shape }, { compact: true })}</div>`;
      else html += '<div class="empty">이 ST의 본문이 색인에 없습니다.</div>';
      if (one?.beats?.length) html += S.sim?.id === s.id ? simHtml() : '<div class="row"><button class="btn pri" data-sim="start">▶ 시뮬레이션 — 처음부터 돌려 보기</button><button class="btn" disabled title="D-055 의 조사 뒤">직전 상태로 들어가기</button></div>';
      if (s.warn?.length) html += `<div class="s warn">가벼운 검사: ${s.warn.map(esc).join(' · ')}</div>`;
      if (s.f.length || s.t.length) html += `<div class="meta">쓰는 조건: ${[...s.f, ...s.t].map((c) => `<span class="chip">${esc(condText([c]))}</span>`).join('')}</div>`;
      const rd = S.redo[s.id];
      if (rd?.fields) html += `<div class="box"><b>새 판 — 이전 판과 나란히</b><div class="vs"><div><div class="s">이전 판</div>${one?.beats ? dialogHtml(one) : s.fields ? cardHtml({ id: s.id, fields: s.fields, order: Object.keys(s.fields), shape: s.shape ?? shapeOf(catOf(s.cat) ?? { id: s.cat }) }) : ''}</div><div><div class="s">새 판</div>${cardHtml({ id: s.id, fields: rd.fields, order: Object.keys(rd.fields), shape: s.shape ?? shapeOf(catOf(s.cat) ?? { id: s.cat }) })}</div></div>
        <div class="row"><button class="btn pri" data-x="takeRedo">새 판으로</button><button class="btn" data-x="dropRedo">이전 판 그대로</button></div></div>`;
      html += `<div class="box"><b>고쳐 달라고 하기</b><textarea data-q="fb" rows="2" placeholder="예: 대꾸가 밋밋해. 손님이 더 능청스럽게.">${esc(rd?.note ?? '')}</textarea><div class="row"><button class="btn" data-x="redo" ${rd?.busy ? 'disabled' : ''}>${rd?.busy ? '만드는 중…' : '다시 만들기'}</button>
        ${['draft', 'checked', 'new'].includes(st) ? '<button class="btn pri" data-x="apply">적용 (게임에 넣기)</button><button class="btn" data-x="drop">버리기</button>' : ''}</div></div>`;
    } else if (S.cat) {
      const c = catOf(S.cat) ?? { id: S.cat, name: S.cat }, ps = patsOf(S.cat), lay = layerText(c);
      html += `<h2>${esc(c.name ?? c.id)}</h2><div class="meta"><span class="id">${esc(c.id)}</span><span>ST ${alive(c.id)}${c.want ? ` / ${c.want}` : ''}</span>${lay ? `<span>${esc(lay)}</span>` : ''}${decideText(c) ? `<span>고르기: ${esc(decideText(c))}</span>` : ''}
        ${ps.length ? `<span>쓰는 패턴: ${ps.map((p) => esc(p.name)).join(' · ')}</span>` : '<span class="warn">이 카테고리를 부르는 패턴이 아직 없음</span>'}</div>`;
      if (c.kids?.length) html += `<div class="s">갈래: ${c.kids.map((k) => `${esc(short(k))} ${alive(k)}`).join(' / ')} — 갈래를 골라 그 안에 만든다</div>`;
      else html += makeHtml(c);
    } else if (S.pat) {
      const p = pats().find((x) => x.id === S.pat);
      html += `<h2>${esc(p.name)}</h2><div class="meta"><span class="id">${esc(p.id)}</span>${p.src === 'tool' ? '<span class="tag new">도구가 만든 것</span>' : ''}</div>
        <div>${p.f.length ? esc(condText(p.f)) + ' ' : ''}${ROLES[p.from] ?? ''}이(가) → ${p.t.length ? esc(condText(p.t)) + ' ' : ''}${ROLES[p.to] ?? ''}에게</div>
        ${p.raw_when?.length ? `<div class="s raw">정보로 못 푼 조건: ${esc(p.raw_when.join(' · '))}</div>` : ''}
        <div class="meta">차례</div><div class="steps">${p.steps.length ? p.steps.map(stepHtml).join('<span class="ar">›</span>') : '<span class="s">없음 — 카테고리 칸에서 넣기</span>'}</div>
        <div class="row"><button class="btn" data-x="useTarget">이 패턴의 대상을 위에 불러오기</button></div>`;
    } else html = '<div class="empty" style="padding:0">위에서 대상을 정하고, 패턴 → 카테고리 → ST 순으로 고르면 여기에 자세한 내용이 나옵니다.</div>';
    if (S.msg) html += `<div class="toast">${esc(S.msg)}</div>`;
    box.innerHTML = html;
  }
  // ST 더 만들기 (2-6): 주제 + 개수 → brief → 소설 → 고쳐 달라고 하기 → 적용
  function makeHtml(c) {
    const levels = Object.entries(S.lib.prompts?.levels ?? {}).filter(([, v]) => v).map(([k]) => k);
    let h = `<div class="box"><b>이 카테고리에 ST 더 만들기</b><input data-q="topic" placeholder="주제 — 예: 집안 걱정, 빚, 몸이 아픈 이야기" value="${esc(S.topic ?? '')}">
      <div class="row"><label>개수 <input data-q="cnt" class="num" type="number" min="1" max="10" value="${S.cnt ?? 5}"></label>
      <label>수위 <select data-q="level">${levels.map((l) => `<option ${l === (S.level ?? 'general') ? 'selected' : ''}>${esc(l)}</option>`).join('') || '<option>general</option>'}</select></label>
      <button class="btn pri" data-x="briefs" ${S.busy ? 'disabled' : ''}>${S.busy === 'briefs' ? '만드는 중…' : 'brief 만들기'}</button></div>
      <div class="s">지금 대상의 조건을 달고 태어난다: ${esc(targetText(S.T, (id) => info(id).name, (r) => ROLES[r] ?? r))} · ${aiKey.has() ? '그록을 바로 부른다' : '열쇠가 없어 대기열로 (저장소의 자동 작업이 만든다)'}</div></div>`;
    if (S.briefs) h += `<div class="box"><b>brief ${S.briefs.length}개 — 고치거나 빼고 진행</b>${S.briefs.map((b, i) => `<div class="brief${b.off ? ' off' : ''}"><textarea data-bi="${i}" rows="1">${esc(b.t)}</textarea><button class="btn sm" data-boff="${i}">${b.off ? '넣기' : '빼기'}</button></div>`).join('')}
      <div class="row"><button class="btn pri" data-x="novels" ${S.busy ? 'disabled' : ''}>${S.busy === 'novels' ? '만드는 중…' : '소설로 만들기'}</button><button class="btn" data-x="keepBriefs">brief로만 남기기</button></div></div>`;
    return h;
  }

  function draw() {
    if (S.loading || !S.lib) { el.querySelector('.cols').classList.add('is-loading'); R('detail').innerHTML = `<div class="empty">${S.err ? esc(S.err) : '읽는 중…'}</div>`; drawTop(); return; }
    el.querySelector('.cols').classList.remove('is-loading');
    drawTop(); drawTarget(); drawInfo(); drawPat(); drawCat(); drawSt(); drawDetail(); drawDots();
  }
  // 폰: 칸이 가로로 넘겨 보는 꼴 — 아래 점으로 지금 칸
  const COLS = ['info', 'pat', 'cat', 'st', 'det'], COLKO = ['정보', '패턴', '카테고리', 'ST', '상세'];
  function drawDots() { R('dots').innerHTML = S.narrow ? COLS.map((c, i) => `<button class="${S.col === i ? 'on' : ''}" data-col="${i}">${COLKO[i]}</button>`).join('') : ''; }
  function goCol(i) { S.col = i; drawDots(); if (S.narrow) el.querySelector(`.col.${COLS[i]}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); }

  // ── 쓰기
  function addInfo(id, side, only = false) {
    const i = info(id), T = S.T[side];
    if (!roleOk(i, T.role)) { S.msg = `${i.name}은(는) ${ROLES[i.who] ?? i.who}에게만 붙습니다.`; return; }
    const k = T.c.findIndex((c) => c.id === id);
    if (k >= 0) { if (!only) T.c.splice(k, 1); } else { T.c = T.c.filter((c) => !excl(c.id, id)); T.c.push({ id, n: i.levels ? 2 : null }); }
    S.msg = '';
  }
  async function saveTarget() {
    const T = S.T, nm = `${condText(T.f.c)} ${ROLES[T.f.role]} → ${condText(T.t.c)} ${ROLES[T.t.role]}`.replace(/\s+/g, ' ').trim();
    const t = { id: `t_${Date.now().toString(36)}`, name: nm, from: T.f.role, to: T.t.role, f: T.f.c.map((c) => ({ ...c })), t: T.t.c.map((c) => ({ ...c })) };
    S.targets.push(t);
    await backend.saveLib('_lib/targets.json', { targets: S.targets });
    S.msg = `대상을 저장했습니다: ${nm}`;
  }
  async function request(text) {
    const cur = (await backend.readLib('_lib/requests.json')) ?? { requests: [] };
    cur.requests = [...(cur.requests ?? []), { at: new Date().toISOString(), text, side: S.side === 'f' ? 'from' : 'to', by: 'maker' }];
    await backend.saveLib('_lib/requests.json', cur);
    S.msg = `정보 추가 요청을 남겼습니다 — 총괄 · CD 가 본다: "${text}"`; S.sugg = null;
  }
  const saveToolPats = () => backend.saveLib(`${S.owner}/patterns.json`, { patterns: S.toolPats });
  const saveToolCats = () => backend.saveLib(`${S.owner}/categories.json`, { categories: S.toolCats });
  function newPat(name) {
    const T = S.T, id = `p_${Date.now().toString(36)}`;
    const p = { id, name, target: { from: T.f.role, to: T.t.role, f: T.f.c.map((c) => ({ ...c })), t: T.t.c.map((c) => ({ ...c })) }, steps: [], note: '' };
    S.toolPats.push(p); S.pat = id; S.cat = S.st = null; S.q.pat = ''; el.querySelector('[data-q="pat"]').value = '';
    S.msg = '새 패턴을 만들었습니다. 카테고리 칸에서 차례를 넣으세요.';
    return saveToolPats();
  }
  function addStep(cid) {
    let p = S.toolPats.find((x) => x.id === S.pat);
    if (!p) { // 게임의 패턴 — 손대지 않고 새 패턴으로 떠서
      const g = pats().find((x) => x.id === S.pat);
      p = { id: `p_${Date.now().toString(36)}`, name: `${g.name} (도구)`, target: { from: g.from, to: g.to, f: g.f, t: g.t }, steps: [...g.steps], note: `${g.id} 에서 뜸` };
      S.toolPats.push(p); S.pat = p.id;
    }
    p.steps.push(cid); S.msg = `${cname(cid)}을(를) 차례에 넣었습니다.`;
    return saveToolPats();
  }

  // 만들기
  const tgtObj = () => ({ from: S.T.f.role, to: S.T.t.role, f: S.T.f.c, t: S.T.t.c });
  const tgtText = () => targetText(S.T, (id) => info(id).name, (r) => ROLES[r] ?? r);
  const curCat = () => catOf(S.cat) ?? { id: S.cat };
  const shapeOf = (c) => c.shape || S.lib.prompts?.categories?.[c.id]?.shape || store.orderOf?.(S.owner, c.id)?.shape || '';
  // 화면의 가벼운 검사 (넘김-3 4절): 틀의 칸 이름 · 한 줄 40자 — 걸리면 표시만 하고 저장은 그대로 (저장소의 검사가 정한다)
  function lightCheck(shape, fields) {
    const out = [], known = S.lib.shapes?.shapes?.[shape]?.fields ?? store.S.shapes?.[shape]?.fields;
    for (const [k, v] of Object.entries(fields ?? {})) {
      if (known?.length && !known.includes(k)) out.push(`틀 ${shape} 에 없는 칸: ${k}`);
      if (typeof v === 'string' && k !== 'title' && v.length > 40) out.push(`${k} 한 줄이 ${v.length}자 (40자까지)`);
    }
    return out;
  }
  async function doBriefs() {
    const n = Math.max(1, Math.min(10, +S.cnt || 5)), c = curCat();
    S.busy = 'briefs'; S.msg = ''; drawDetail();
    try {
      const r = await ai.briefs({ owner: S.owner, category: c.id, target: tgtText(), targetObj: tgtObj(), topic: S.topic ?? '', n, level: S.level ?? 'general' });
      if (r.queued) { S.briefs = null; S.msg = `brief ${n}개를 대기열에 넣었습니다 — 저장소의 자동 작업이 만들면 ST 칸에 brief 로 들어온다.`; }
      else { S.briefs = r.items.map((t) => ({ t, off: false })); S.msg = r.usd ? `brief ${r.items.length}개 · $${r.usd.toFixed(4)}` : ''; }
    } catch (e) { S.msg = e.message; }
    S.busy = null; draw();
  }
  async function doNovels(keepOnly) {
    const c = curCat(), list = S.briefs.filter((b) => !b.off), level = S.level ?? 'general', batch = `w${Date.now().toString(36)}`;
    if (keepOnly) {
      const cards = list.map((b, k) => ({ ref: `${batch}_${k}`, category: c.id, shape: shapeOf(c), level, prev: [], target: tgtObj(), status: 'brief', fields: { brief: b.t }, model: aiModel.get(), batch }));
      await ai.save(cards);
      cards.forEach((x, k) => S.made.unshift({ id: x.ref, ref: x.ref, title: list[k].t, cat: c.id, status: 'brief', level, src: 'card', f: S.T.f.c, t: S.T.t.c, brief: list[k].t }));
      S.briefs = null; S.msg = `${list.length}개를 brief로 남겼습니다 (대기열 → 카드 파일).`; return draw();
    }
    S.busy = 'novels'; drawDetail();
    const done = [];
    try {
      for (const b of list) {
        const r = await ai.novel({ category: c.id, shape: shapeOf(c), target: tgtText(), brief: b.t, level });
        if (r.queued) { // 대기열 길: brief 로 저장하고 소설은 다음 걸음 (novels 는 카드 id 로)
          const rest = list.slice(list.indexOf(b));
          await ai.save(rest.map((x, k) => ({ ref: `${batch}_b${k}`, category: c.id, shape: shapeOf(c), level, prev: [], target: tgtObj(), status: 'brief', fields: { brief: x.t }, model: aiModel.get(), batch })));
          S.msg = `그록을 바로 부를 수 없어 남은 brief ${rest.length}개를 대기열에 넣었습니다 — 들어오면 하나씩 "소설로 만들기".`; S.briefs = null; break;
        }
        const id = `${batch}_${done.length}`, warn = lightCheck(shapeOf(c), r.fields);
        done.push({ ref: id, category: c.id, shape: shapeOf(c), level, prev: [], target: tgtObj(), status: 'draft', fields: r.fields, model: r.model, batch });
        S.made.unshift({ id, ref: id, title: r.fields.title ?? b.t, cat: c.id, status: 'new', level, src: 'card', f: S.T.f.c, t: S.T.t.c, fields: r.fields, shape: shapeOf(c), warn });
        drawSt();
      }
      if (done.length) { await ai.save(done); S.briefs = null; S.msg = `소설 ${done.length}개 — ST 칸에서 하나씩 보고 적용합니다 (저장은 대기열 → 카드 파일).`; }
    } catch (e) { S.msg = e.message; }
    S.busy = null; draw();
  }
  async function doRedo() {
    const s = sts().find((x) => x.id === S.st), note = el.querySelector('[data-q="fb"]')?.value.trim() ?? '';
    if (!note) { S.msg = '무엇을 고칠지 적어 주세요.'; return drawDetail(); }
    const one = S.one[s.id], c = catOf(s.cat) ?? { id: s.cat };
    S.redo[s.id] = { note, busy: true }; drawDetail();
    try {
      const card = s.fields ?? (one?.beats ? one.beats.map((b) => [b.role, b.say ?? (b.choices ?? []).map((x) => x.text).join(' / ')]) : s.title);
      const r = await ai.redo({ id: s.id, category: s.cat, shape: shapeOf(c), card, note, level: s.level });
      S.redo[s.id] = r.queued ? { note } : { note, fields: r.fields };
      S.msg = r.queued ? '대기열에 넣었습니다 — 새 판이 오면 이전 판과 나란히 보여 줍니다.' : '';
    } catch (e) { S.redo[s.id] = { note }; S.msg = e.message; }
    drawDetail();
  }
  async function apply(to) {
    const s = sts().find((x) => x.id === S.st);
    if (s.ref) { await backend.queue({ picks: [{ ref: s.ref, to }] }, `${to} ${s.ref}`); s.status = to === 'picked' ? 'picked' : 'dropped'; S.msg = to === 'picked' ? '적용했습니다 — 카드가 저장소에 적히면 굽기까지 자동으로.' : '버렸습니다. 다음 생성 때 피할 것으로 쓰입니다.'; return draw(); }
    store.setStatus([[s.id, to]]);
    S.msg = to === 'picked' ? '적용했습니다 — 굽기를 거쳐 게임에 들어갑니다.' : '버렸습니다. 다음 생성 때 피할 것으로 쓰입니다.';
    if (to === 'dropped') S.st = null;
    draw();
  }

  // ── 이벤트
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button, .slot'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (b.classList.contains('slot')) S.side = d.side;
    if (d.role) { const T = S.T[d.side]; T.role = d.role; T.c = T.c.filter((c) => roleOk(info(c.id), d.role)); S.side = d.side; }
    if (d.lv) { const c = S.T[d.side].c.find((x) => x.id === d.lv); c.n = ((c.n ?? 2) % 4) + 1; }
    if (d.rm) { const T = S.T[d.side]; T.c = T.c.filter((c) => c.id !== d.rm); }
    if (d.kind != null) S.kind = d.kind;
    if (d.info) addInfo(d.info, S.side);
    if (d.sg) addInfo(d.sg, d.sgside, true);          // 제안은 넣기만 (이미 있으면 그대로)
    if (d.target != null) { const t = S.targets[+d.target]; S.T = { f: { role: t.from, c: t.f.map((c) => ({ ...c })) }, t: { role: t.to, c: t.t.map((c) => ({ ...c })) } }; S.pat = S.cat = S.st = null; S.briefs = null; S.msg = ''; }
    if (d.pat) { S.pat = S.pat === d.pat ? null : d.pat; S.cat = S.st = null; S.briefs = null; S.msg = ''; if (S.pat) goCol(2); }
    if (d.cat) { S.cat = S.cat === d.cat ? null : d.cat; S.st = null; S.briefs = null; S.msg = ''; if (S.cat) goCol(3); }
    if (d.addcat) await addStep(d.addcat);
    if (d.st) { S.st = S.st === d.st ? null : d.st; S.msg = ''; S.sim = null; if (S.st) goCol(4); }
    if (d.boff != null) S.briefs[+d.boff].off = !S.briefs[+d.boff].off;
    if (d.col != null) return goCol(+d.col);
    if (d.sim === 'start' || d.sim === 'restart') { const r = createRunner(S.lib.look); S.sim = { id: S.st, r, state: r.start(S.one[S.st], { cond: condFromTarget }) }; }
    if (d.sim === 'close') S.sim = null;
    if (d.pickc != null && S.sim) S.sim.state = S.sim.r.choose(+d.pickc);
    if (d.sip != null && S.sim) S.sim.state = S.sim.r.answer('hold', +d.sip);
    if ((d.sim === 'mashY' || d.sim === 'mashN') && S.sim) S.sim.state = S.sim.r.answer('mash', d.sim === 'mashY');
    if ((d.sim === 'condY' || d.sim === 'condN') && S.sim) S.sim.state = S.sim.r.answer('cond', d.sim === 'condY');
    switch (d.x) {
      case 'match': { const r = ai.match(el.querySelector('[data-q="nl"]').value, S.lib.info, ROLES); for (const [side, role] of Object.entries(r.roles)) { S.T[side].role = role; S.T[side].c = S.T[side].c.filter((c) => roleOk(info(c.id), role)); } S.sugg = r; break; }
      case 'clear': S.T.f.c = []; S.T.t.c = []; S.sugg = null; S.msg = ''; break;
      case 'request': await request(S.sugg.missing); break;
      case 'saveTarget': await saveTarget(); break;
      case 'showNo': return;
      case 'left': S.left = d.v; break;
      case 'newPat': await newPat(S.q.pat); break;
      case 'newCat': S.newCat = { id: '', err: '' }; break;
      case 'newCatGo': {
        const id = el.querySelector('[data-q="newCatId"]').value.trim();
        if (!ID.test(id)) { S.newCat = { id, err: 'id 는 영어 소문자 · 숫자 · 밑줄 (갈래는 /)' }; break; }
        if (catOf(id)) { S.newCat = { id, err: `이미 있는 카테고리: ${id}` }; break; }
        S.toolCats.push({ id, name: S.q.cat, about: '', parent: id.includes('/') ? id.split('/')[0] : null, brief: '', shape: '', want: 10 });
        await saveToolCats(); S.newCat = null; S.cat = id; S.q.cat = ''; el.querySelector('[data-q="cat"]').value = '';
        if (S.pat) await addStep(id);
        S.msg = `새 카테고리 ${id} 를 만들었습니다 — 도구의 원본(Cards/${S.owner}/categories.json). 굽기가 엔진 파일을 만든다.`; break;
      }
      case 'useTarget': { const p = pats().find((x) => x.id === S.pat); S.T = { f: { role: p.from, c: p.f.map((c) => ({ id: idOf(c), n: nOf(c) })) }, t: { role: p.to, c: p.t.map((c) => ({ id: idOf(c), n: nOf(c) })) } }; break; }
      case 'briefs': return doBriefs();
      case 'novels': return doNovels(false);
      case 'keepBriefs': return doNovels(true);
      case 'toNovel': { const s = sts().find((x) => x.id === S.st); if (s?.ref) await backend.queue({ novels: [{ refs: [s.ref] }] }, `소설 ${s.ref}`); else await ai.novelsQueued([S.st]); S.msg = '소설로 만들기를 대기열에 넣었습니다.'; break; }
      case 'redo': return doRedo();
      case 'takeRedo': { const s = sts().find((x) => x.id === S.st), rd = S.redo[s.id]; await backend.queue({ redo: [{ ...(s.ref ? { ref: s.ref } : { id: s.id }), note: rd.note, fields: rd.fields }] }, `새 판 ${s.id}`); if (s.fields) s.fields = rd.fields; S.redo[s.id] = null; S.msg = '새 판을 저장했습니다 — 이전 판은 versions 에 남는다.'; break; }
      case 'dropRedo': S.redo[S.st] = null; break;
      case 'apply': return apply('picked');
      case 'drop': return apply('dropped');
      case 'keySet': { const v = el.querySelector('[data-q="key"]').value; if (v.trim()) { aiKey.set(v); await pickModel(); } break; }
      case 'keyClear': aiKey.clear(); S.models = []; break;
      default: break;
    }
    draw();
  });
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.x === 'showNo') { S.showNo = t.checked; draw(); }
    if (t.dataset.x === 'model') aiModel.set(t.value);
    if (t.dataset.q === 'level') S.level = t.value;
  });
  el.addEventListener('input', (e) => {
    const t = e.target, q = t.dataset.q;
    if (t.dataset.bi != null) { S.briefs[+t.dataset.bi].t = t.value; return; }
    if (q === 'topic') S.topic = t.value; if (q === 'cnt') S.cnt = t.value;
    if (q === 'fb' && S.st) S.redo[S.st] = { ...(S.redo[S.st] ?? {}), note: t.value };
    if (q === 'newCatId' && S.newCat) S.newCat.id = t.value;
    if (q in S.q) { S.q[q] = t.value.trim(); ({ info: drawInfo, pat: drawPat, cat: drawCat, st: drawSt })[q](); }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.q === 'nl') { e.preventDefault(); el.querySelector('[data-x="match"]').click(); }
    if (e.key === 'Enter' && e.target.dataset.q === 'key') { e.preventDefault(); el.querySelector('[data-x="keySet"]').click(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('slot')) { S.side = e.target.dataset.side; draw(); }
  });
  // 폰: 가로로 밀면 지금 칸이 바뀐다
  el.querySelector('.cols').addEventListener('scroll', (e) => { if (!S.narrow) return; const w = e.target.clientWidth; const i = Math.round(e.target.scrollLeft / w); if (i !== S.col) { S.col = i; drawDots(); } }, { passive: true });

  const pickModel = async () => { S.models = await ai.models(); if (S.models.length && !S.models.includes(aiModel.get())) aiModel.set(S.models[0]); drawTop(); };
  load().then(() => (aiKey.has() ? pickModel() : null));
  return {
    el, S, ai, backend, reload: load,
    setNarrow(n) { if (S.narrow === n) return; S.narrow = n; el.classList.toggle('is-narrow', n); drawDots(); },
    refreshTop: () => { if (S.lib) drawTop(); },
  };
}
