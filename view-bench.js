// 작업대 (D-053 · 넘김-3) — 첫 화면. 대상 → 패턴 → 카테고리 → ST · 상세. 왼쪽에서 고르면 오른쪽이 걸러진다.
// 꼴과 흐름은 견본(docs/maker-3/st-bench-견본.html)을 따른다. 속은 진짜로:
//   데이터 = backends.js 의 bench(이름) · benchSt(id) · readLib/saveLib · queue (색인 · 명령 → 없으면 가짜 응답)
//   시뮬레이션 = runner.js (갈아 끼울 수 있는 한 겹) · 만들기 = ai.js (바로 부름 · 대기열)
// 화면은 내용을 모른다 — 본문은 받은 그대로 보여 준다. 없는 조건을 지어내지 않는다(없으면 정보 추가 요청).
// 이 화면은 자기 DOM 을 들고 있다(입력 · 스크롤을 잃지 않게) — app.js 가 다시 그려도 같은 판을 다시 붙인다.
import { esc } from './ui.js';
import { BENCH } from './backends.js';
import { createRunner } from './runner.js';
import { createAi, aiKey, aiModel, targetText, targetLine } from './ai.js';
import { cardHtml } from './bubbles.js';

const ROLES = { guest: '손님', staff: '종업원', boss: '사장' };
const ROLEKO = { ...ROLES, any: '누구나' };                     // 패턴 · ST 의 from/to 에는 any 가 있다 (역할 단추에는 없음)
// 한 장의 카드가 brief → 소설 → ST 로 자란다 (넘김-3 4-4 · D-053 5-2) — 같은 id
const STATUS = { live: 'ST · 게임에 있음', picked: 'ST 로 만드는 중', draft: '소설', checked: '소설', brief: 'brief', dropped: '버림' };
const STAGE = { brief: 'brief', draft: 'novel', checked: 'novel', live: 'st', picked: 'st' }, STAGEKO = { brief: 'brief', novel: '소설', st: 'ST' };
const NOKEY = '그록 열쇠가 없어 만들지 않았습니다 — 위 줄에 열쇠를 넣거나, PC 에서 채우기(런처 · 돌리기)를 쓰세요. (대기열에서 그록을 부르는 느린 길은 아직 없습니다)';
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
if (typeof window !== 'undefined') window.cityMakerBench = benchFor;

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
    one: {}, sim: null, made: [], redo: {}, newCat: null, usd: 0, models: [], narrow: false, col: 0,
    stFilter: '', sel: new Set(), status: {}, raw: '', busy: null,
  };
  const ai = createAi({ getPrompts: () => S.lib?.prompts, onCost: (u) => { S.usd += u; drawTop(); } });

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
    if (x.from && x.from !== 'any' && T.f.role && x.from !== T.f.role) return 0;
    if (x.to && x.to !== 'any' && T.t.role && x.to !== T.t.role) return 0;
    const bad = (mine, theirs) => mine.some((m) => theirs.some((t) => excl(m.id, idOf(t))));
    if (bad(T.f.c, x.f ?? []) || bad(T.t.c, x.t ?? [])) return 0;
    if (!T.f.c.length && !T.t.c.length) return 1;
    // 대상의 조건을 모두 쓰고, 정도가 있으면 대상의 단계가 그것이 요구하는 단계 이상일 때 딱 맞음
    const uses = (mine, theirs) => mine.every((m) => { const o = theirs.find((t) => idOf(t) === m.id); return o && (!nOf(o) || !m.n || m.n >= nOf(o)); });
    return uses(T.f.c, x.f ?? []) && uses(T.t.c, x.t ?? []) ? 2 : 1;
  }

  // ── 패턴 · 카테고리 (게임의 것 + 도구가 만든 것)
  const pats = () => [...(S.lib.patterns ?? []), ...S.toolPats.map((p) => ({ ...p, src: 'tool', from: p.target?.from ?? p.from, to: p.target?.to ?? p.to, f: p.target?.f ?? p.f ?? [], t: p.target?.t ?? p.t ?? [] }))];
  const cats = () => [...(S.lib.categories ?? []).filter((c) => c.id), ...S.toolCats.filter((c) => !S.lib.catById.has(c.id)).map((c) => ({ ...c, src: 'tool', kids: [], counts: { live: 0, draft: 0, brief: 0 }, layers: [] }))];
  const catOf = (id) => cats().find((c) => c.id === id);
  const parentOf = (id) => catOf(id)?.parent ?? cats().find((c) => (c.kids ?? []).includes(id))?.id ?? null;
  const patsOf = (cid) => { const par = parentOf(cid); return pats().filter((p) => p.steps.includes(cid) || (par && p.steps.includes(par))); };
  // 화면에서 방금 만든 것(S.made)이 색인의 같은 id 를 가린다 — 색인이 따라오기 전까지
  const inIndex = (id) => (S.lib.sts ?? []).some((s) => s.id === id);
  const sts = () => { const mine = new Set(S.made.map((s) => s.id)); return [...S.made, ...(S.lib.sts ?? []).filter((s) => !mine.has(s.id))]; };
  const effStatus = (s) => S.status[s.id] ?? s.status;
  const alive = (cid) => { const c = catOf(cid); return c?.counts ? c.counts.live : sts().filter((s) => s.cat === cid && s.status === 'live').length; };
  const waiting = (cid) => { const c = catOf(cid); return (c?.counts ? c.counts.draft + c.counts.brief : 0) + S.made.filter((s) => s.cat === cid && !inIndex(s.id)).length; };
  const stFit = (s) => { if (S.made.includes(s)) return Math.max(1, fitRaw(s)); return fitRaw(s); };
  // ST 의 f · t 는 카테고리의 조건을 물려받은 것까지 (4-2) · from/to 에 any 가 있다
  const fitRaw = (s) => { const base = fit({ from: s.from, to: s.to, f: s.f ?? [], t: s.t ?? [] }), ps = patsOf(s.cat); if (!ps.length || !base) return base; return Math.max(...ps.map((p) => fit({ from: p.from, to: p.to, f: [...p.f, ...(s.f ?? [])], t: [...p.t, ...(s.t ?? [])] }))); };
  const layerText = (c) => { const lc = c.layer_counts ?? {}; const ks = Object.keys(lc); return ks.length > 1 ? ks.map((k) => `${k === '_base' ? '공용' : k === 'tavern' ? '선술집' : k} ${lc[k]}`).join(' + ') : ''; };
  // 갈래가 있으면 갈래마다의 수 — 윗 카테고리 자신에도 ST 가 있으면 그 수도 (치근덕 4 (합석 청하기 4))
  const stepHtml = (id) => { const k = catOf(id)?.kids ?? [], own = alive(id); return `<span class="stp">${esc(short(id))}${k.length ? `${own ? ` <i>${own}</i>` : ''} <i>(${k.map((c) => `${esc(short(c))} ${alive(c)}`).join(' / ')})</i>` : ` <i>${own}</i>`}</span>`; };
  const decideText = (c) => (c.decide === 'commit' ? '먼저 정하고 기다림' : { best: '가장 구체적인 것', random: '무작위', mix: '섞어서' }[c.pick] ?? c.pick ?? '');
  // decide(계획) 와 decide_engine(엔진이 지금 하는 방식)이 다르면 작게 (4-2)
  const engineNote = (c) => (c.decide_engine && c.decide && c.decide !== c.decide_engine ? ` <small class="eng" title="엔진은 지금 ${esc(c.decide_engine)} 로 고른다">아직 엔진에 없음</small>` : '');
  const actOf = (intent) => { const A = S.lib.look?.acts ?? {}; return A[intent] ?? A[S.lib.look?.aliases?.[intent]?.verb] ?? null; };
  const endName = (e) => { const ko = S.lib.look?.ends?.[e]; return ko ? `${ko} (${e})` : e; };
  // 일과 패턴 (steps 가 비고 plan 이 있음): do 단계를 사람 말로
  const planText = (plan) => plan.map((x) => { const d = x.do ?? {}; return `${actOf(d.intent)?.ko ?? d.intent ?? '?'}${d.to || d.at ? ' ' + (d.to ?? d.at) : ''}`; }).join(' › ');

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
        <div class="s">${esc(condText(t.f))} ${ROLEKO[t.from] ?? ''} → ${esc(condText(t.t))} ${ROLEKO[t.to] ?? ''}</div></button>`).join('') || '<div class="empty">저장된 대상이 없습니다.</div>';
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
        return `<button class="item${on ? ' sel' : ''}${ok ? '' : ' no'}" data-info="${i.id}"><div class="t">${esc(i.name)}${i.levels ? '<span class="dots" title="정도 4단계"><i></i><i></i><i></i><i></i></span>' : ''} <span class="id">${esc(i.id)}</span>${i.word ? '<small class="wd" title="상황 사전의 낱말 — 방금 있었던 일 (prev)">낱말</small>' : ''}${i.check ? '<small class="chk" title="조건 꼴을 CD 가 아직 확인 안 함">확인 전</small>' : ''}</div>
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
      <div class="s">${p.f.length ? esc(condText(p.f)) + ' ' : ''}${ROLEKO[p.from] ?? ''} → ${p.t.length ? esc(condText(p.t)) + ' ' : ''}${ROLEKO[p.to] ?? ''}</div>
      <div class="steps">${p.steps.length ? p.steps.map(stepHtml).join('<span class="ar">›</span>') : p.plan?.length ? `<span class="s plan">일과: ${esc(planText(p.plan))}</span>` : '<span class="s">카테고리 없음</span>'}</div>
      ${p.raw_when?.length ? `<div class="s raw">${esc(p.raw_when.join(' · '))}</div>` : ''}</button>`).join('');
    if (q && !rows.length) html = `<div class="empty">맞는 패턴이 없습니다.</div><button class="item" data-x="newPat"><div class="t">+ 새 패턴 제안: ${esc(q)}</div><div class="s">지금 대상으로 만들고, 카테고리는 다음 칸에서 넣기</div></button>`;
    R('pat').innerHTML = html || '<div class="empty">이 대상에 맞는 패턴이 없습니다. 위에 말로 적어 새로 만들 수 있습니다.</div>';
    R('patN').textContent = `${rows.length}개`;
  }
  function catRow(c, i) {
    const a = alive(c.id), w = waiting(c.id), lay = layerText(c), dec = decideText(c), dr = c.counts?.dropped ?? 0;
    return `<button class="item${S.cat === c.id ? ' sel' : ''}${c.missing ? ' missing' : ''}" data-cat="${esc(c.id)}"><div class="t">${i != null ? `<span class="stepno">${i + 1}</span>` : ''}${esc(c.name ?? c.id)} <span class="id">${esc(c.id)}</span>${c.src === 'tool' ? '<span class="tag new">도구</span>' : ''}${c.label ? `<small class="wd" title="스킬 카테고리의 이름표">${esc(c.label)}</small>` : ''}</div>
      <div class="s">ST ${a}${c.want ? ` / ${c.want}` : ''}${w ? ` · 기다리는 것 ${w}` : ''}${dr ? ` · 버림 ${dr}` : ''}${lay ? ` · <span class="layer" title="세상 공용 + 장소가 덧붙인 것">${esc(lay)}</span>` : ''}</div>
      ${c.missing ? '<div class="s bad">폴더가 없음 — 주문에만 있는 카테고리</div>' : ''}
      ${c.about || dec ? `<div class="s">${c.about ? esc(c.about) + ' · ' : ''}${dec ? `고르기: ${esc(dec)}${engineNote(c)}` : ''}</div>` : ''}</button>`;
  }
  function drawCat() {
    const q = S.q.cat, p = pats().find((x) => x.id === S.pat); let html = '';
    if (p) {
      html += `<div class="grp">${esc(p.name)}의 차례</div>` + (p.steps.length ? p.steps.map((id, i) => {
        const c = catOf(id) ?? { id, name: id };
        if (c.kids?.length) return `<div class="parent"><span class="stepno">${i + 1}</span><b>${esc(c.name)}</b> <span class="id">${esc(id)}</span>
          <div class="s"><b class="dec">${esc(decideText(c))}</b>${engineNote(c)}${c.about ? ` — ${esc(c.about)}` : ''}</div></div>` + c.kids.map((k) => `<div class="kid">${catRow(catOf(k) ?? { id: k, name: k }, null)}</div>`).join('');
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
  // ST 칸: 위에 상태 필터(brief · 소설 · ST) · brief 와 소설은 골라서(여럿) 소설 만들기 · ST 로 만들기
  function drawSt() {
    if (!S.cat) { R('st').innerHTML = '<div class="empty">카테고리를 고르면 그 안의 ST가 나옵니다.</div>'; R('stN').textContent = ''; return; }
    const q = S.q.st, order = { brief: 1, draft: 2, checked: 2, picked: 3, live: 4, dropped: 5 };
    const all = sts().filter((s) => s.cat === S.cat && (!q || (s.title ?? '').includes(q))).map((s) => ({ s, f: stFit(s), g: STAGE[effStatus(s)] ?? '' })).filter((r) => S.showNo || r.f > 0)
      .sort((a, b) => (b.s.fresh ? 1 : 0) - (a.s.fresh ? 1 : 0) || (b.f - a.f) || ((order[effStatus(a.s)] ?? 9) - (order[effStatus(b.s)] ?? 9)));
    const rows = all.filter((r) => !S.stFilter || r.g === S.stFilter);
    const nOf = (g) => all.filter((r) => r.g === g).length;
    const sel = [...S.sel].map((id) => sts().find((x) => x.id === id)).filter((x) => x && x.cat === S.cat);
    const selB = sel.filter((x) => effStatus(x) === 'brief'), selN = sel.filter((x) => STAGE[effStatus(x)] === 'novel');
    let html = `<div class="stf seg sm" role="group" aria-label="상태">${[['', `전부 ${all.length}`], ...Object.entries(STAGEKO).map(([g, ko]) => [g, `${ko} ${nOf(g)}`])].map(([g, t]) => `<button data-stf="${g}" class="${S.stFilter === g ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`;
    if (selB.length || selN.length) html += `<div class="selbar">${selB.length ? `<button class="btn sm pri" data-x="selNovels" ${S.busy ? 'disabled' : ''}>${S.busy === 'novels' ? '만드는 중…' : `고른 brief ${selB.length}개 소설 만들기`}</button>` : ''}${selN.length ? `<button class="btn sm pri" data-x="selPick" ${S.busy ? 'disabled' : ''}>고른 소설 ${selN.length}개 ST 로 만들기</button>` : ''}<button class="btn sm" data-x="selClear">고르기 풀기</button></div>`;
    html += rows.map(({ s, f, g }) => { const st = effStatus(s), can = g === 'brief' || g === 'novel';
      return `<div class="strow">${can ? `<input type="checkbox" data-sel="${esc(s.id)}" ${S.sel.has(s.id) ? 'checked' : ''} aria-label="고르기">` : '<span class="nosel"></span>'}<button class="item${S.st === s.id ? ' sel' : ''}${f === 0 ? ' no' : ''}" data-st="${esc(s.id)}"><div class="t">${esc(s.title ?? s.id)}<span class="tag ${st}">${STATUS[st] ?? st}</span>${s.fresh ? '<span class="tag new">방금</span>' : ''}${f === 2 ? '<span class="tag fit">딱 맞음</span>' : ''}</div>
        ${(s.f?.length || s.t?.length) ? `<div class="s">${esc(condText([...(s.f ?? []), ...(s.t ?? [])]))}</div>` : ''}${st === 'brief' && s.brief && s.brief !== s.title ? `<div class="s">${esc(s.brief)}</div>` : ''}</button></div>`; }).join('') || `<div class="empty">${S.stFilter ? `${STAGEKO[S.stFilter]} 상태의 ST가 없습니다.` : '이 대상에 맞는 ST가 없습니다. 오른쪽에서 더 만들 수 있습니다.'}</div>`;
    R('st').innerHTML = html;
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
  function fxChips(a) {
    const A = actOf(a.intent) ?? {}, f = A.fx ?? {}, c = [];
    if (f.stop) c.push(`멈칫 ${f.stop.sec}초${f.stop.lock ? ' · 못 걸음' : ''}`); if (f.shake) c.push(`화면 흔들림 ${f.shake === 'big' ? '크게' : '작게'}`);
    if (f.hitstop) c.push(`순간 정지 ${f.hitstop}초`); if (f.sfx) c.push(`소리 ${f.sfx}`);
    if (A.pop) c.push(`팝 ${A.pop}`); if (A.anim) c.push(`몸짓 ${A.anim}`); if (A.touch) c.push('닿음');
    if (A.holds) c.push(`붙잡고 있음 → ${(actOf(A.ends_by) ?? {}).ko ?? A.ends_by}로 풀림`);
    return c.map((x) => `<span class="fxc">${esc(x)}</span>`).join('');
  }
  const actLine = (a) => { const A = actOf(a.intent) ?? {}; return `<div class="stage">〔${esc(A.ko ?? a.intent)}${a.part ? ' · ' + esc(a.part) : ''}${a.what ? ' · ' + esc(a.what) : ''}〕 ${fxChips(a)}</div>`; };
  const roleKo = (r) => S.lib.look?.roles?.[r] ?? ROLES[r] ?? r;
  const miniOf = (a) => { const A = actOf(a?.intent) ?? {}; return A.input === 'hold' ? '마시기 판' : (A.mash || A.input === 'mash') ? '연타' : ''; };
  function optHtml(c, k) {
    const A = c.act ? actOf(c.act.intent) ?? {} : null, mg = c.act ? miniOf(c.act) : '';
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
      if (b.end) h += `<div class="stage">→ 끝: ${esc(endName(b.end))}</div>`;
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
    if (w?.t === 'mini' && w.kind === 'mash') h += `<div class="mini"><b>연타 — ${esc((actOf(w.act.intent) ?? {}).ko ?? w.act.intent)}</b><div>키를 연타해 겨룬다. 상대가 붙잡은 힘과 리나의 힘으로 맞춘다.</div><div class="row"><button class="btn sm" data-sim="mashY">성공</button><button class="btn sm" data-sim="mashN">실패</button></div></div>`;
    if (X.done) { const r = X.result ?? {};
      h += `<div class="endc"><b>끝: ${esc(endName(X.done))}</b>${r.remember?.length ? `<div>남는 기억</div>${r.remember.map((x) => `<code>${esc(x)}</code>`).join('')}` : ''}${r.leave ? `<div>남는 낱말</div><code>${esc(JSON.stringify(r.leave))}</code>` : ''}${r.state ? `<div>바뀌는 값</div><code>${esc(JSON.stringify(r.state))}</code>` : ''}${r.emit ? `<div>알리는 사건</div><code>${esc(Object.keys(r.emit).join(' · '))}</code>` : ''}${!r.remember && !r.state && !r.emit && !r.leave ? '<div>따로 남기는 것 없음 (표준 끝맺음이 있으면 엔진이 채운다)</div>' : ''}</div>`; }
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
      const st = effStatus(s), one = S.one[s.id], C = S.lib.prompts?.categories?.[s.cat], g = STAGE[st];
      const briefOnly = st === 'brief' || (one && !one.beats?.length && one.brief && !s.fields);
      const nv = one?.versions?.length ?? 0;
      html += `<h2>${esc(s.title ?? s.id)}</h2><div class="meta"><span class="tag ${st}">${STATUS[st] ?? st}</span><span>${esc(cname(s.cat))}</span><span class="id">${esc(s.id)}</span>${s.src === 'hand' ? '<span>손으로 쓴 ST</span>' : s.src === 'base' ? '<span>세상 공용</span>' : ''}<span>수위 ${esc(s.level ?? '')}</span>${nv ? `<span title="이전 판은 versions 에">이전 판 ${nv}</span>` : ''}${s.model ? `<span class="id">${esc(s.model)}</span>` : ''}</div>`;
      if (briefOnly) {
        if (s.brief == null && one === undefined) oneOf(s.id);
        html += `<div class="box"><b>brief</b><div>${esc(s.brief ?? one?.brief ?? (one === undefined ? '읽는 중…' : s.title))}</div><div class="row"><button class="btn pri" data-x="toNovel" ${S.busy ? 'disabled' : ''}>${S.busy === 'novels' ? '만드는 중…' : '소설로 만들기'}</button><button class="btn" data-x="drop">버리기</button></div>
          ${C ? '' : '<div class="s">이 카테고리는 요청문 표에 없어 소설로 만들 수 없습니다 (손으로 쓰는 ST).</div>'}</div>`;
      } else if (s.fields) html += `<div class="cardv">${cardHtml({ id: s.id, fields: s.fields, order: Object.keys(s.fields), shape: s.shape, prev: s.prev }, { compact: true })}</div>${s.fields.brief ? `<div class="s">brief: ${esc(s.fields.brief)}</div>` : ''}`;
      else if (one === undefined) { oneOf(s.id); html += '<div class="empty">읽는 중…</div>'; }
      else if (one?.beats?.length) html += dialogHtml(one);
      else html += '<div class="empty">이 ST의 본문이 색인에 없습니다.</div>';
      if (!s.fields && one?.beats?.length) html += S.sim?.id === s.id ? simHtml() : '<div class="row"><button class="btn pri" data-sim="start">▶ 시뮬레이션 — 처음부터 돌려 보기</button><button class="btn" disabled title="D-055 의 조사 뒤">직전 상태로 들어가기</button></div>';
      if (s.warn?.length) html += `<div class="s warn">가벼운 검사: ${s.warn.map(esc).join(' · ')}</div>`;
      if (s.f?.length || s.t?.length) html += `<div class="meta">쓰는 조건: ${[...(s.f ?? []), ...(s.t ?? [])].map((c) => `<span class="chip">${esc(condText([c]))}</span>`).join('')}</div>`;
      if (s.prev?.length) html += `<div class="meta">방금 있었던 일: ${s.prev.map((w) => `<span class="chip">${esc(info(w).name)}</span>`).join('')}</div>`;
      if (!briefOnly) {
        const rd = S.redo[s.id], sh = shapeOf(catOf(s.cat) ?? { id: s.cat }), keep = !['live', 'picked'].includes(st) && (s.src === 'card' || S.made.includes(s));
        if (rd?.fields) html += `<div class="box"><b>새 판 — 이전 판과 나란히</b><div class="vs"><div><div class="s">이전 판</div>${s.fields ? cardHtml({ id: s.id, fields: s.fields, order: Object.keys(s.fields), shape: sh }) : one?.beats ? dialogHtml(one) : ''}</div><div><div class="s">새 판</div>${cardHtml({ id: s.id, fields: rd.fields, order: Object.keys(rd.fields), shape: sh })}</div></div>
          ${rd.warn?.length ? `<div class="s warn">가벼운 검사: ${rd.warn.map(esc).join(' · ')}</div>` : ''}
          <div class="row"><button class="btn pri" data-x="takeRedo">${keep ? '새 판으로' : '새 카드로 저장'}</button><button class="btn" data-x="dropRedo">이전 판 그대로</button></div>${keep ? '' : '<div class="s">게임에 있는 것 · 손으로 쓴 것은 바꾸지 않는다 — 새 id 의 소설로 저장한다.</div>'}</div>`;
        html += C ? `<div class="box"><b>고쳐 달라고 하기</b><textarea data-q="fb" rows="2" placeholder="예: 대꾸가 밋밋해. 손님이 더 능청스럽게.">${esc(rd?.note ?? '')}</textarea><div class="row"><button class="btn" data-x="redo" ${rd?.busy ? 'disabled' : ''}>${rd?.busy ? '만드는 중…' : '다시 만들기'}</button>
          ${g === 'novel' ? '<button class="btn pri" data-x="apply">ST 로 만들기</button><button class="btn" data-x="drop">버리기</button>' : ''}</div></div>`
          : (g === 'novel' ? '<div class="row"><button class="btn pri" data-x="apply">ST 로 만들기</button><button class="btn" data-x="drop">버리기</button></div>' : '');
      }
    } else if (S.cat) {
      const c = catOf(S.cat) ?? { id: S.cat, name: S.cat }, ps = patsOf(S.cat), lay = layerText(c);
      html += `<h2>${esc(c.name ?? c.id)}</h2><div class="meta"><span class="id">${esc(c.id)}</span><span>ST ${alive(c.id)}${c.want ? ` / ${c.want}` : ''}</span>${lay ? `<span>${esc(lay)}</span>` : ''}${decideText(c) ? `<span>고르기: ${esc(decideText(c))}</span>` : ''}
        ${ps.length ? `<span>쓰는 패턴: ${ps.map((p) => esc(p.name)).join(' · ')}</span>` : '<span class="warn">이 카테고리를 부르는 패턴이 아직 없음</span>'}</div>`;
      if (c.kids?.length) html += `<div class="s">갈래: ${c.kids.map((k) => `${esc(short(k))} ${alive(k)}`).join(' / ')} — 갈래를 골라 그 안에 만든다</div>`;
      else html += makeHtml(c);
    } else if (S.pat) {
      const p = pats().find((x) => x.id === S.pat);
      html += `<h2>${esc(p.name)}</h2><div class="meta"><span class="id">${esc(p.id)}</span>${p.src === 'tool' ? '<span class="tag new">도구가 만든 것</span>' : ''}</div>
        <div>${p.f.length ? esc(condText(p.f)) + ' ' : ''}${ROLEKO[p.from] ?? ''}이(가) → ${p.t.length ? esc(condText(p.t)) + ' ' : ''}${ROLEKO[p.to] ?? ''}에게</div>
        ${p.raw_when?.length ? `<div class="s raw">정보로 못 푼 조건: ${esc(p.raw_when.join(' · '))}</div>` : ''}
        <div class="meta">차례</div><div class="steps">${p.steps.length ? p.steps.map(stepHtml).join('<span class="ar">›</span>') : p.plan?.length ? `<span class="s plan">일과 (카테고리 없이 할 일의 차례): ${esc(planText(p.plan))}</span>` : '<span class="s">없음 — 카테고리 칸에서 넣기</span>'}</div>
        <div class="row"><button class="btn" data-x="useTarget">이 패턴의 대상을 위에 불러오기</button></div>`;
    } else html = '<div class="empty" style="padding:0">위에서 대상을 정하고, 패턴 → 카테고리 → ST 순으로 고르면 여기에 자세한 내용이 나옵니다.</div>';
    if (S.msg) html += `<div class="toast">${esc(S.msg)}</div>`;
    if (S.raw) html += `<details class="rawans"><summary>받은 답의 앞부분</summary><pre>${esc(S.raw)}</pre></details>`;
    box.innerHTML = html;
  }
  // ST 더 만들기 (2-6 · 4-4): 주제 + 개수 → brief (바로 저장 · ST 칸에 brief 로) → 골라서 소설 → 고쳐 달라고 하기 → ST 로 만들기
  function makeHtml(c) {
    const C = S.lib.prompts?.categories?.[c.id];
    if (!C) return `<div class="box"><b>이 카테고리에 ST 더 만들기</b><div class="s">요청문 표(prompts.json)에 이 카테고리가 없습니다 — 손으로 쓰는 ST 입니다. 만들기는 요청문 표에 있는 카테고리만.</div></div>`;
    const lv = S.lib.prompts?.levels ?? {}, levels = Object.keys(lv).filter((k) => String(lv[k] ?? '').trim() && (!C.levels?.length || C.levels.includes(k)));
    return `<div class="box"><b>이 카테고리에 ST 더 만들기</b><input data-q="topic" placeholder="주제 — 예: 집안 걱정, 빚, 몸이 아픈 이야기" value="${esc(S.topic ?? '')}">
      <div class="row"><label>개수 <input data-q="cnt" class="num" type="number" min="1" max="10" value="${S.cnt ?? 5}"></label>
      <label>수위 <select data-q="level">${levels.map((l) => `<option ${l === (S.level ?? levels[0]) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <button class="btn pri" data-x="briefs" ${S.busy || !levels.length ? 'disabled' : ''}>${S.busy === 'briefs' ? '만드는 중…' : 'brief 만들기'}</button></div>
      <div class="s">지금 대상의 조건을 달고 태어난다: ${esc(targetText(S.T, (id) => info(id).name, (r) => ROLES[r] ?? r))} · ${aiKey.has() ? '그록을 바로 부른다 — 만든 brief 는 바로 저장되어 ST 칸에 brief 로' : '그록 열쇠가 없으면 만들 수 없다 (위 줄에 넣거나 PC 에서 채우기)'}</div>
      ${levels.length ? '' : '<div class="s bad">이 카테고리의 수위 가운데 요청문 표에 풀이가 있는 것이 없습니다.</div>'}</div>`;
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

  // ── 만들기 (넘김-3 4-2 · 4-4) — 바로 부름(ai.js)만. 열쇠가 없으면 대기열에 넣지 않는다 (느린 길이 아직 없음)
  // 저장은 대기열의 cards: [{ id, owner, category, shape, level, prev, act, status: brief|draft, fields, model, batch }] — 같은 id 를 다시 보내면 새 판
  const tgtObj = () => ({ from: S.T.f.role, to: S.T.t.role, f: S.T.f.c, t: S.T.t.c });
  const curCat = () => catOf(S.cat) ?? { id: S.cat };
  const shapeOf = (c) => S.lib.prompts?.categories?.[c.id]?.shape || c.shape || store.orderOf?.(S.owner, c.id)?.shape || '';
  const ownerOf = (cid) => S.lib.prompts?.categories?.[cid]?.owner || catOf(cid)?.owner || S.owner;
  const isWord = (id) => !!info(id).word;
  // 한 장의 대상: 화면에서 만든 것은 그때의 대상 · 색인의 것은 그 ST 의 조건 (낱말은 prev)
  const tOf = (s) => ({ f: { role: s.from ?? 'guest', c: [...(s.f ?? []), ...(s.prev ?? []).map((id) => ({ id }))] }, t: { role: s.to ?? 'staff', c: s.t ?? [] } });
  const lineOf = (T) => targetLine(S.lib.prompts, T, info);
  const nowT = () => ({ from: S.T.f.role, to: S.T.t.role, f: S.T.f.c.filter((c) => !isWord(c.id)).map((c) => ({ ...c })), t: S.T.t.c.filter((c) => !isWord(c.id)).map((c) => ({ ...c })),
    prev: [...S.T.f.c, ...S.T.t.c].filter((c) => isWord(c.id)).map((c) => c.id) });
  const usedIds = () => new Set(sts().map((x) => x.id));
  const qCard = (x, status, fields, model) => {
    const C = S.lib.prompts?.categories?.[x.cat] ?? {}, f = { ...fields }; let act = '';
    if (f.act && (C.acts ?? []).includes(f.act)) { act = f.act; delete f.act; }        // 틀글에 없는 칸 act — 그 카테고리의 동작이면 카드의 act 로
    return { id: x.id, owner: x.owner || ownerOf(x.cat), category: x.cat, shape: shapeOf(catOf(x.cat) ?? { id: x.cat }), level: x.level ?? 'general', prev: x.prev ?? [], act, status, fields: f,
      model: model ?? x.model ?? '', batch: x.batch ?? '', target: { from: x.from, to: x.to, f: x.f ?? [], t: x.t ?? [] } };
  };
  // 화면에 바로 보이는 한 장 (색인이 따라오기 전까지 같은 id 의 색인 것을 가린다)
  function putMade(x) { const k = S.made.findIndex((m) => m.id === x.id); if (k >= 0) S.made[k] = { ...S.made[k], ...x }; else S.made.unshift(x); delete S.status[x.id]; S.one[x.id] = undefined; return x; }
  const noKey = () => { if (aiKey.has()) return false; S.msg = NOKEY; S.raw = ''; drawDetail(); return true; };
  const fail = (e) => { S.msg = e.message; S.raw = e.raw ?? ''; };
  const money = (u) => (u ? ` · $${u.toFixed(4)}` : '');
  // 화면의 가벼운 검사 (4-2): 틀의 칸 이름 · 꼭 있어야 할 칸 · 한 줄 line_max 자 — 걸리면 표시만 하고 저장은 그대로 (저장소의 검사가 정한다)
  function lightCheck(cat, fields) {
    const P = S.lib.prompts ?? {}, C = P.categories?.[cat] ?? {}, L = P.limits ?? {}, out = [];
    const known = C.fields ?? [], max = L.line_max ?? 40, notLine = new Set([...(L.not_lines ?? ['title']), 'brief']);
    for (const [k, v] of Object.entries(fields ?? {})) {
      if (known.length && !known.includes(k) && k !== 'brief') out.push(`틀 ${C.shape ?? ''} 에 없는 칸: ${k}`);
      if (typeof v === 'string' && !notLine.has(k) && v.length > max) out.push(`${k} 한 줄이 ${v.length}자 (${max}자까지)`);
    }
    for (const k of C.required ?? []) if (!String(fields?.[k] ?? '').trim()) out.push(`꼭 있어야 할 칸이 비었음: ${k}`);
    return out;
  }
  async function doBriefs() {
    if (noKey()) return;
    const n = Math.max(1, Math.min(10, +S.cnt || 5)), c = curCat(), C = S.lib.prompts?.categories?.[c.id] ?? {};
    const lv = S.lib.prompts?.levels ?? {}, level = S.level ?? Object.keys(lv).find((k) => String(lv[k] ?? '').trim() && (!C.levels?.length || C.levels.includes(k))) ?? 'general';
    const batch = `w${Date.now().toString(36)}`, T = nowT();
    S.busy = 'briefs'; S.msg = ''; S.raw = ''; drawDetail();
    try {
      const r = await ai.briefs({ category: c.id, target: lineOf(S.T), topic: S.topic ?? '', n, level, used: usedIds() });
      const made = r.items.map((x) => ({ id: x.id, title: x.brief, brief: x.brief, cat: c.id, status: 'brief', level, src: 'card', owner: ownerOf(c.id), ...T, model: r.model, batch, fresh: true }));
      await backend.queue({ cards: made.map((x) => qCard(x, 'brief', { brief: x.brief }, r.model)) }, `brief ${made.length} ${c.id}`);
      made.reverse().forEach(putMade);
      S.stFilter = S.stFilter === 'brief' || !S.stFilter ? S.stFilter : '';
      S.msg = `brief ${made.length}개를 만들어 저장했습니다${money(r.usd)} — ST 칸에서 골라 "소설 만들기".`;
    } catch (e) { fail(e); }
    S.busy = null; draw();
  }
  // 골라 둔 brief 들 → 소설 (같은 id 의 새 판 · status draft · brief 칸은 남긴다)
  async function doNovels(ids) {
    if (noKey()) return;
    const list = ids.map((id) => sts().find((x) => x.id === id)).filter((x) => x && effStatus(x) === 'brief');
    if (!list.length) { S.msg = '소설로 만들 brief 를 골라 주세요.'; S.raw = ''; return drawDetail(); }
    const no = list.filter((x) => !S.lib.prompts?.categories?.[x.cat]);
    if (no.length) { S.msg = `요청문 표에 없는 카테고리라 소설로 만들 수 없습니다: ${[...new Set(no.map((x) => x.cat))].join(' · ')}`; S.raw = ''; return drawDetail(); }
    S.busy = 'novels'; S.msg = ''; S.raw = ''; draw();
    let n = 0, spent = 0;
    try {
      for (const x of list) if (x.brief == null) { const one = S.one[x.id] ?? (await backend.benchSt(x.id).catch(() => ({ data: null }))).data; S.one[x.id] = one; x.brief = one?.brief ?? x.title; }
      const groups = new Map();                            // 카테고리 · 수위 · 대상이 같은 것끼리 (요청문의 WHO 가 같게)
      for (const x of list) { const k = [x.cat, x.level ?? 'general', lineOf(tOf(x))].join('\n'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
      for (const xs of groups.values()) {
        const x0 = xs[0];
        const r = await ai.novels({ category: x0.cat, target: lineOf(tOf(x0)), level: x0.level ?? 'general', briefs: xs.map((x) => ({ id: x.id, brief: x.brief })),
          onOne: (card) => { const x = xs.find((y) => y.id === card.id); putMade({ ...x, title: card.fields.title || x.brief, status: 'draft', fields: { ...card.fields, brief: x.brief }, shape: shapeOf(catOf(x.cat) ?? { id: x.cat }), warn: lightCheck(x.cat, card.fields), fresh: true }); S.sel.delete(x.id); drawSt(); } });
        spent += r.usd;
        if (r.cards.length) { await backend.queue({ cards: r.cards.map((card) => qCard(sts().find((y) => y.id === card.id), 'draft', { ...card.fields, brief: card.brief }, r.model)) }, `소설 ${r.cards.length} ${x0.cat}`); n += r.cards.length; }
        if (r.err) throw r.err;
      }
      S.msg = `소설 ${n}개를 만들어 저장했습니다${money(spent)} — 같은 카드가 brief 에서 소설로. 골라서 "ST 로 만들기".`;
    } catch (e) { fail(e); if (n) S.msg = `소설 ${n}개까지 저장했습니다. 그다음에서 멈춤 — ${e.message}`; }
    S.busy = null; draw();
  }
  // 색인의 ST 를 다시 만들 때 보내는 "지금의 카드" — 칸이 있으면 칸, 없으면 비트의 말을 줄로
  const cardNow = (s, one) => s.fields ?? (one?.beats?.length ? one.beats.flatMap((b) => [b.say ? `${b.role}: ${b.say}` : null, ...(b.choices ?? []).map((c) => `${b.role} (choice): ${c.text}`)]).filter(Boolean).join('\n') : s.title);
  async function doRedo() {
    if (noKey()) return;
    const s = sts().find((x) => x.id === S.st), note = el.querySelector('[data-q="fb"]')?.value.trim() ?? '';
    if (!note) { S.msg = '무엇을 고칠지 적어 주세요.'; S.raw = ''; return drawDetail(); }
    S.redo[s.id] = { note, busy: true }; S.msg = ''; S.raw = ''; drawDetail();
    try {
      const one = s.fields ? null : S.one[s.id] ?? (await backend.benchSt(s.id).catch(() => ({ data: null }))).data;
      const r = await ai.redo({ category: s.cat, target: lineOf(tOf(s)), card: cardNow(s, one), note, level: s.level ?? 'general' });
      S.redo[s.id] = { note, fields: r.card.fields, model: r.model, warn: lightCheck(s.cat, r.card.fields) };
      S.msg = r.usd ? `새 판${money(r.usd)}` : '';
    } catch (e) { S.redo[s.id] = { note }; fail(e); }
    drawDetail();
  }
  // 새 판 저장 — 같은 id (이전 판은 versions). 게임에 있는 것 · 손으로 쓴 것은 바꾸지 않고 새 id 의 소설로
  async function takeRedo() {
    const s = sts().find((x) => x.id === S.st), rd = S.redo[s.id], st = effStatus(s);
    const keep = !['live', 'picked'].includes(st) && (s.src === 'card' || S.made.includes(s));
    const P = S.lib.prompts ?? {}, pre = (P.categories?.[s.cat]?.prefix || s.id.split('_')[0] || 'card').replace(/[^a-z0-9_]/g, '_');
    let id = s.id; if (!keep) { const used = usedIds(); let k = 1; do { id = `${pre}_${Date.now().toString(36)}${k++}`; } while (used.has(id)); }
    const x = { ...s, id, status: 'draft', title: rd.fields.title || s.title, fields: { ...rd.fields, ...(s.brief ? { brief: s.brief } : {}) }, shape: shapeOf(catOf(s.cat) ?? { id: s.cat }), warn: rd.warn, model: rd.model, batch: s.batch || `w${Date.now().toString(36)}`, src: 'card', fresh: true, prev: s.prev ?? [] };
    await backend.queue({ cards: [qCard(x, 'draft', x.fields, rd.model)] }, `새 판 ${id}`);
    putMade(x); S.redo[s.id] = null; S.st = id;
    S.msg = keep ? '새 판을 저장했습니다 — 이전 판은 versions 에 남는다.' : `새 카드 ${id} 로 저장했습니다 (원래 것은 그대로).`;
  }
  // ST 로 만들기 · 버리기 — 대기열의 picks (id 로)
  async function setTo(ids, to) {
    if (!ids.length) return;
    await backend.queue({ picks: ids.map((id) => ({ id, to })) }, `${to} ${ids.join(' ')}`.slice(0, 80));
    for (const id of ids) { S.status[id] = to; S.sel.delete(id); }
    S.msg = to === 'picked' ? `ST 로 만들기 ${ids.length}개 — 저장소의 자동 작업이 카드를 적고 굽기까지.` : `버렸습니다 ${ids.length}개 — 다음 생성 때 피할 것으로 쓰입니다.`; S.raw = '';
    if (to === 'dropped' && ids.includes(S.st)) S.st = null;
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
    if (d.target != null) { const t = S.targets[+d.target]; S.T = { f: { role: t.from, c: t.f.map((c) => ({ ...c })) }, t: { role: t.to, c: t.t.map((c) => ({ ...c })) } }; S.pat = S.cat = S.st = null; S.sel.clear(); S.msg = S.raw = ''; }
    if (d.pat) { S.pat = S.pat === d.pat ? null : d.pat; S.cat = S.st = null; S.sel.clear(); S.msg = S.raw = ''; if (S.pat) goCol(2); }
    if (d.cat) { S.cat = S.cat === d.cat ? null : d.cat; S.st = null; S.sel.clear(); S.msg = S.raw = ''; if (S.cat) goCol(3); }
    if (d.addcat) await addStep(d.addcat);
    if (d.st) { S.st = S.st === d.st ? null : d.st; S.msg = S.raw = ''; S.sim = null; if (S.st) goCol(4); }
    if (d.stf != null) S.stFilter = d.stf;
    if (d.col != null) return goCol(+d.col);
    if (d.sim === 'start' || d.sim === 'restart') { const r = createRunner(S.lib.look); S.sim = { id: S.st, r, state: r.start(S.one[S.st], { cond: condFromTarget }) }; }
    if (d.sim === 'close') S.sim = null;
    if (d.pickc != null && S.sim) S.sim.state = S.sim.r.choose(+d.pickc);
    if (d.sip != null && S.sim) S.sim.state = S.sim.r.answer('hold', +d.sip);
    if ((d.sim === 'mashY' || d.sim === 'mashN') && S.sim) S.sim.state = S.sim.r.answer('mash', d.sim === 'mashY');
    if ((d.sim === 'condY' || d.sim === 'condN') && S.sim) S.sim.state = S.sim.r.answer('cond', d.sim === 'condY');
    switch (d.x) {
      case 'match': {
        b.disabled = true; b.textContent = '찾는 중…';
        try { const r = await ai.match(el.querySelector('[data-q="nl"]').value, S.lib.info, ROLES); for (const [side, role] of Object.entries(r.roles)) { S.T[side].role = role; S.T[side].c = S.T[side].c.filter((c) => roleOk(info(c.id), role)); } S.sugg = r; S.msg = S.raw = ''; } catch (e2) { fail(e2); }
        b.disabled = false; b.textContent = '맞는 정보 찾기'; break;
      }
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
      case 'selNovels': return doNovels([...S.sel]);
      case 'toNovel': return doNovels([S.st]);
      case 'selPick': await setTo([...S.sel].filter((id) => { const x = sts().find((y) => y.id === id); return x && STAGE[effStatus(x)] === 'novel'; }), 'picked'); break;
      case 'selClear': S.sel.clear(); break;
      case 'redo': return doRedo();
      case 'takeRedo': await takeRedo(); break;
      case 'dropRedo': S.redo[S.st] = null; break;
      case 'apply': await setTo([S.st], 'picked'); break;
      case 'drop': await setTo([S.st], 'dropped'); break;
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
    if (t.dataset.sel) { if (t.checked) S.sel.add(t.dataset.sel); else S.sel.delete(t.dataset.sel); drawSt(); }
  });
  el.addEventListener('input', (e) => {
    const t = e.target, q = t.dataset.q;
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
