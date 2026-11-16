// ST 메이커 — 화면들이 같이 보는 상태. 데이터 길(backends.js)이 무엇이든 같은 꼴로 들고 있는다.
//   일감 = plan 의 칸 + 아직 반영되지 않은 고르기 · 고르기는 0.5초 모아 pick 으로 내보낸다 · 주문 · 줄거리는 고치면 바로 쓴다.
import { lenient } from './backends.js';

export const LEVELS = ['general', 'soft', 'middle', 'hard'];
// 누가 누구에게 (D-046) — 역할 셋의 아홉 칸 + 혼자 + 본 사람
const ROLE = { guest: '손님', staff: '종업원', boss: '사장' };
export const WHO = [
  ...Object.keys(ROLE).flatMap((a) => Object.keys(ROLE).map((b) => ({ id: `${a}>${b}`, label: `${ROLE[a]} → ${ROLE[b]}` }))),
  { id: 'solo', label: '혼자' }, { id: 'seen', label: '본 사람' },
];
export const whoLabel = (id) => WHO.find((w) => w.id === id)?.label ?? id;
export const prevOf = (x) => (Array.isArray(x?.prev) ? x.prev : x?.prev ? [x.prev] : []).filter((w) => w && w !== '-');
const prevKey = (x) => prevOf(x).slice().sort().join('+') || '-';
const ALIVE = ['live', 'picked'];

export function createStore(backend) {
  const S = {
    ready: false, loading: false, error: null, kind: backend.kind, label: backend.label, caps: backend.caps,
    shapes: {}, plan: { cells: [], problems: [] }, cards: [], cardById: new Map(),
    owners: [],                 // [{ id, pack, categories:[{ id, pick, depth }], patterns:[{ id, steps, when }] | null }]
    orders: {}, stories: [],    // 주인 → orders.json 의 내용 · [{ pack, data }]
    words: null,                // { situations, readOnly, values } (Set) — 모르면 null (사전 검사를 건너뛴다)
    pending: {}, sent: {},      // 아직 반영되지 않은 고르기: id → 상태 · 그 가운데 이미 내보낸 것
    runs: [], busy: null,
    last: null,                 // 저장소의 자동 작업이 방금 한 일 (밖의 길에서만 — Cards/_index/last.json)
  };
  const subs = new Set();
  const emit = () => { for (const f of [...subs]) { try { f(); } catch (e) { console.error('[maker]', e); } } };
  let work = Promise.resolve();                              // 쓰기 · 명령을 한 줄로 세운다 (순서가 뒤집히지 않게)
  const chain = (fn) => { const p = work.then(fn, fn); work = p.catch(() => {}); return p; };
  const fail = (e) => { S.error = e?.message ?? String(e); console.error('[maker]', e); emit(); };

  // ── 읽기
  async function loadIndex() {
    const [sh, cd, pl, last] = await Promise.all([backend.shapes(), backend.cards(), backend.plan(), backend.last?.() ?? null]);
    S.last = last;
    S.shapes = sh.shapes ?? {};
    S.cards = cd.cards ?? []; S.cardById = new Map(S.cards.map((c) => [c.id, c]));
    S.plan = { cells: pl.cells ?? [], problems: pl.problems ?? [] };
    // 반영된 고르기는 줄에서 뺀다
    for (const id of Object.keys(S.pending)) if (!S.cardById.has(id) || S.cardById.get(id).status === S.pending[id]) { delete S.pending[id]; delete S.sent[id]; }
    backend.savePending?.({ pending: S.pending, sent: S.sent });
  }
  async function loadSide() {
    const [orders, stories] = await Promise.all([backend.orders(), backend.stories()]);
    S.orders = Object.fromEntries(Object.entries(orders).map(([k, d]) => [k, { ...d, orders: d.orders ?? {} }]));
    S.stories = stories.sort((a, b) => `${a.pack}/${a.data.id}`.localeCompare(`${b.pack}/${b.data.id}`));
  }
  async function loadTree() {
    const [tree, words] = await Promise.all([backend.tree(), backend.words()]);
    S.words = words && { situations: new Set(words.situations), readOnly: new Set(words.readOnly), values: new Set(words.values) };
    // 나무를 못 읽는 길(밖)에서는 일감 표의 칸으로 어림한다 — 칸에 카테고리 · 쓰는 패턴 · 앞 카테고리가 실려 온다
    const owners = new Map((tree ?? []).map((o) => [o.id, o]));
    if (!tree) for (const c of S.plan.cells) {
      if (c.kind === 'story' || !c.owner) continue;
      const o = owners.get(c.owner) ?? owners.set(c.owner, { id: c.owner, pack: c.owner.split('/')[0], categories: [], patterns: null }).get(c.owner);
      if (!o.categories.some((x) => x.id === c.category)) o.categories.push({ id: c.category, pick: '' });
    }
    for (const o of owners.values()) { o.categories.sort((a, b) => a.id.localeCompare(b.id)); for (const c of o.categories) c.depth = c.id.split('/').length - 1; o.patterns?.sort((a, b) => a.id.localeCompare(b.id)); }
    S.owners = [...owners.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  async function load() {
    S.loading = true; S.error = null; emit();
    try {
      await backend.init();
      const saved = backend.loadPending?.() ?? {};
      S.pending = { ...(saved.pending ?? {}) }; S.sent = { ...(saved.sent ?? {}) };
      S.runs = (await backend.loadRuns?.()) ?? [];
      await loadIndex();
      await Promise.all([loadSide(), loadTree()]);
      S.ready = true;
    } catch (e) { S.error = e?.message ?? String(e); S.failed = e; console.error('[maker]', e); }
    S.loading = false; emit();
  }

  // ── 일감 (plan 의 칸 + 아직 반영되지 않은 고르기)
  const effStatus = (c) => S.pending[c.id] ?? c.status;
  const inCell = (card, cell) => (cell.kind === 'story' ? card.category === cell.category
    : card.category === cell.category && (!card.owner || card.owner === cell.owner) && card.level === cell.level && prevKey(card) === prevKey(cell));
  const cardsOfCell = (cell) => S.cards.filter((c) => inCell(c, cell));
  function cells() {
    const list = S.plan.cells.map((c) => {
      const have = { live: 0, picked: 0, draft: 0, checked: 0, dropped: 0, ...c.have };
      return { ...c, prev: prevOf(c), have, hand: c.hand ?? 0, ordered: c.ordered ?? true };
    });
    for (const [id, st] of Object.entries(S.pending)) {
      const card = S.cardById.get(id); const cell = card && list.find((c) => inCell(card, c));
      if (!cell) continue;
      if (card.status in cell.have) cell.have[card.status]--;
      if (st in cell.have) cell.have[st]++;
    }
    for (const c of list) {
      c.alive = c.have.live + c.have.picked + c.hand;                  // 살아 있는 것 = 카드(live · picked) + 손으로 쓴 ST
      c.waiting = c.have.draft + c.have.checked;                       // 고르기를 기다리는 후보
      c.missing = Math.max(0, (c.want ?? 0) - c.alive);
    }
    return list;
  }

  // ── 고르기. changes = [[id, 상태]] · one = 줄거리 장면에서 하나만 살린 카드의 id (pick one <id> 로 나간다)
  let flushTimer = null; const ones = new Set();
  function setStatus(changes, one = null) {
    for (const [id, st] of changes) { delete S.sent[id]; ones.delete(id); if (S.cardById.get(id)?.status === st) delete S.pending[id]; else S.pending[id] = st; }
    if (one && S.pending[one] === 'picked') ones.add(one);
    backend.savePending?.({ pending: S.pending, sent: S.sent });
    emit(); flushSoon(500);
  }
  function flushSoon(ms) { clearTimeout(flushTimer); flushTimer = setTimeout(() => { flushTimer = null; chain(flush).catch(fail); }, ms); }
  async function flush() {
    const todo = Object.entries(S.pending).filter(([id]) => !S.sent[id]);
    if (!todo.length) return;
    const mark = (ids) => { for (const id of ids) S.sent[id] = true; };
    for (const id of [...ones]) {
      if (S.pending[id] !== 'picked' || S.sent[id]) { ones.delete(id); continue; }
      await backend.pick([id], 'one'); ones.delete(id);
      const cat = S.cardById.get(id)?.category;                        // one 은 같은 장면의 다른 후보를 버린다 — 그것들도 나간 것으로
      mark(S.cards.filter((c) => c.category === cat && S.pending[c.id]).map((c) => c.id));
    }
    const by = {};
    for (const [id, st] of todo) if (!S.sent[id]) (by[st] ??= []).push(id);
    for (const [st, ids] of Object.entries(by)) { await backend.pick(ids, st); mark(ids); }
    if (!S.caps.deferred) await loadIndex();                           // 바로 반영되는 길(런처): 카드 · 일감을 다시 읽어 맞춘다
    else backend.savePending?.({ pending: S.pending, sent: S.sent });  // 늦게 반영되는 길(대기열): 색인이 올 때까지 먼저 반영된 것처럼 보여 준다
    emit();
  }

  // ── 주문 (orders.json) · 줄거리 (_story/<id>.json)
  const orderOf = (owner, cat) => S.orders[owner]?.orders?.[cat] ?? null;
  let replanTimer = null;
  const changed = () => { emit(); if (!S.caps.deferred) { clearTimeout(replanTimer); replanTimer = setTimeout(() => { replanTimer = null; chain(loadIndex).then(emit, fail); }, 900); } };
  function saveOrder(owner, cat, order) {
    const doc = S.orders[owner] ??= { orders: {} };
    if (order) doc.orders[cat] = order; else delete doc.orders[cat];
    changed();
    return chain(() => backend.saveOrders(owner, doc)).catch(fail);
  }
  function saveStory(story) {
    if (!S.stories.includes(story)) { S.stories.push(story); S.stories.sort((a, b) => `${a.pack}/${a.data.id}`.localeCompare(`${b.pack}/${b.data.id}`)); }
    changed();
    return chain(() => backend.saveStory(story)).catch(fail);
  }
  const sceneOf = (id) => { for (const st of S.stories) { const sc = st.data.scenes.find((x) => x.id === id); if (sc) return { st, sc }; } return null; };
  // 고르기의 한 줄 메모 → 그 카테고리 주문의 note 에 덧붙임 (줄거리 장면이면 그 장면의 note)
  function appendNote(cell, text) {
    const add = (old) => (old ? `${old}\n${text}` : text);
    if (cell.kind === 'story') { const x = sceneOf(cell.scene); if (!x) return null; x.sc.note = add(x.sc.note); return saveStory(x.st); }
    const o = orderOf(cell.owner, cell.category) ?? { brief: cell.brief ?? '', who: cell.who ?? '', shape: cell.shape ?? '', want: cell.want ?? 0, levels: [cell.level], note: '' };
    return saveOrder(cell.owner, cell.category, { ...o, note: add(o.note) });
  }

  // ── 돌리기 (긴 명령 — 되는 길에서만). 끝나면 기록에서 셈 · 돈 · 실패한 줄을 뽑는다
  function summarize(log) {
    const out = { summary: '', fails: [], files: [], tokens: 0, cost: null, got: 0, pass: 0 };
    const lines = String(log ?? '').split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
    let result = null;
    for (const l of lines) {
      let m;
      if (l.startsWith('@@RESULT ')) { try { result = lenient(l.slice(9)); } catch { /* 깨진 줄 */ } continue; }
      if ((m = l.match(/받음 (\d+) · 통과 (\d+) · 탈락 (\d+) · 토큰 (\d+|\?)\+(\d+|\?)(?: · \$([\d.]+))?/))) { out.got += +m[1]; out.pass += +m[2]; out.tokens += (+m[4] || 0) + (+m[5] || 0); if (m[6] != null) out.cost = (out.cost ?? 0) + +m[6]; }
      else if ((m = l.match(/^\s*탈락: (.*)$/))) out.fails.push(m[1]);
      else if ((m = l.match(/^\s*→ (.*)$/))) out.files.push(m[1]);
      else if (/^\s{2}\S/.test(l) && /문제 \d+건/.test(out.summary)) out.fails.push(l.trim());
      if (/카드 검사: 문제|^카드 \d+장|검사만/.test(l)) out.summary = out.summary && !/문제/.test(l) ? `${out.summary} · ${l}` : l;
    }
    if (result?.runs) {                                                  // gen --json 의 끝줄이 있으면 그 값이 정답
      out.cost = result.runs.reduce((n, r) => n + (r.usd ?? 0), 0); out.got = result.runs.reduce((n, r) => n + (r.got ?? 0), 0); out.pass = result.runs.reduce((n, r) => n + (r.ok ?? 0), 0);
    }
    if (out.got) out.summary = `받음 ${out.got} · 통과 ${out.pass} · 탈락 ${out.fails.length}`;
    if (!out.summary) out.summary = lines.filter((l) => !l.startsWith('@@')).pop() ?? '';
    out.fails.splice(60);
    return out;
  }
  async function run(name, args, title) {
    const rec = { at: Date.now(), title, name, args, status: 'running' };
    S.runs.unshift(rec); S.busy = title; emit();
    try { const r = await backend.run(name, args, title); Object.assign(rec, { status: r.status, code: r.code, job: r.job }, summarize(r.log)); }
    catch (e) { rec.status = 'fail'; rec.summary = e.message; }
    rec.end = Date.now(); S.busy = null; S.runs.splice(60);
    backend.saveRuns?.(S.runs);
    await chain(loadIndex).catch(fail);
    emit();
    return rec;
  }
  // 모자란 칸 채우기. cells 가 없으면 전부(gen missing) · 있으면 그 칸만 — 장수는 gen missing 과 같은 셈(모자란 것의 세 배 · 한 번에 12장까지)
  const USD_PER_CARD = 0.0025;                                           // 어림 — 지금까지 장당 약 0.0025달러 (넘김 10절)
  const askN = (c) => Math.min(12, c.missing * 3);
  const estimate = (list) => { const n = list.reduce((s, c) => s + askN(c), 0); return { cells: list.length, cards: n, usd: n * USD_PER_CARD }; };
  async function fill(list) {
    if (backend.fill) {                                                  // 대기열로 (밖): 저장소의 자동 작업이 채운다
      const rec = { at: Date.now(), title: list ? `채우기 — ${list.length}칸 (대기열)` : '채우기 — 모자란 칸 전부 (대기열)', name: 'gen', args: [], status: 'running' };
      S.runs.unshift(rec); S.busy = rec.title; emit();
      try { await chain(() => backend.fill(list && list.map((c) => ({ category: c.category, prev: c.prev[0] ?? '-', level: c.level, n: askN(c) })))); rec.status = 'queued'; rec.summary = '대기열에 넣음 — 저장소의 자동 작업이 채운다 (몇 분 뒤 다시 읽기)'; }
      catch (e) { rec.status = 'fail'; rec.summary = e.message; }
      rec.end = Date.now(); S.busy = null; emit();
      return null;
    }
    if (!list) return run('gen', ['missing', '--json'], '채우기 — 모자란 칸 전부');
    for (const c of list) {
      const n = askN(c);
      const rec = await run('gen', [c.category, ...(c.prev.length ? ['--prev', c.prev[0]] : []), '--level', c.level, '-n', String(n), '--json'],
        `채우기 — ${c.category}${c.prev.length ? ` · ${c.prev[0]}` : ''} · ${c.level} ${n}장`);
      if (rec.status === 'cancelled') break;                            // 취소하면 남은 칸도 그만둔다 · 실패한 칸은 기록에 남기고 다음으로
    }
    return null;
  }
  const bake = (check) => run('bake', check ? ['--check'] : [], check ? '검사 (bake --check)' : '굽기 (bake)');
  // 채울 수 있는 칸: 주문이 있고 · 모자라고 · 일상 (줄거리 장면은 틀 scene 이 생기면)
  const fillable = (c) => c.kind !== 'story' && c.ordered && c.missing > 0 && !!S.shapes[c.shape];   // gen missing 과 같은 고르기 (구울 수 있는 틀만)

  // 늦게 반영되는 길: 반영을 기다리는 것이 있으면 1분마다 색인을 다시 읽는다 (색인이 오면 스스로 맞춤)
  setInterval(() => { if (S.ready && S.caps.deferred && S.kind === 'github' && !S.busy && (Object.keys(S.pending).length || S.runs.some((r) => r.status === 'queued' && Date.now() - r.at < 15 * 60e3)) && !document.hidden) chain(loadIndex).then(emit, fail); }, 60e3);

  return {
    S, backend, load, cells, cardsOfCell, effStatus, setStatus, orderOf, sceneOf, saveOrder, saveStory, appendNote, fill, fillable, estimate, bake,
    reload: () => chain(loadIndex).then(emit, fail),
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    // 밀린 쓰기 · 명령이 다 끝날 때까지 (시험 · 화면을 떠날 때)
    async idle() { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; chain(flush).catch(fail); } if (replanTimer) { clearTimeout(replanTimer); replanTimer = null; chain(loadIndex).then(emit, fail); } let w; do { w = work; await w; } while (w !== work); },
  };
}
