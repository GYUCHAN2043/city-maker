// 작업대의 시뮬레이션 러너 — 견본 수준의 작은 것 (넘김-3 2-5 · D-055 5).
// 규칙이 한 벌로 정해질 때까지 이 한 겹 뒤에 둔다: createRunner(look).start(st, state) · choose(k) · answer(kind, value) · state()
// 조사가 끝나면 이 파일만 진짜 규칙으로 갈아 끼운다. 화면(view-bench.js)은 state() 의 꼴만 안다.
//
// state() = { id, log:[{t:'say'|'pick'|'note', role, text, act, pop, fx}], wait, done, result }
//   wait = { t:'choice', choices:[…], small } | { t:'cond', cond, guess } | { t:'mini', act, kind:'hold'|'mash', steps? }
//   done = 끝 이름 (null 이면 아직) · result = 그 끝이 남기는 것 { remember, leave, state, emit }

export function createRunner(look = {}) {
  const ACTS = look.acts ?? {}, HOLD = look.hold ?? { steps: [] };
  let st = null, X = null;

  const beat = (i) => st.beats[i];
  const goto = (id) => st.beats.findIndex((b) => b.id === id);
  const miniOf = (a) => { const A = ACTS[a?.intent] ?? ACTS[look.aliases?.[a?.intent]?.verb] ?? {}; return A.input === 'hold' ? 'hold' : (A.mash || A.input === 'mash') ? 'mash' : null; };

  function finish(end) { X.done = end; X.wait = null; X.result = (st.result ?? {})[end] ?? null; }
  // 비트 · 선택이 끝난 뒤 어디로
  function after(i, b, c) {
    const end = c ? c.end : b.end, nx = c ? c.next : b.next;
    if (end) return finish(end);
    const j = nx != null ? goto(nx) : i + 1;
    if (j < 0 || !beat(j)) return finish('(끝 이름 없음)');
    run(j);
  }
  // 판이 열리는 동작이면 멈추고 기다린다
  function mini(a, then) {
    const kind = miniOf(a); if (!kind) return false;
    X.wait = { t: 'mini', act: a, kind, steps: kind === 'hold' ? HOLD.steps : null, key: HOLD.key }; X.then = then; return true;
  }
  function run(i, skipIf = false) {
    const b = beat(i);
    if (b.if && !skipIf) {
      // 조건 갈림: 대상이 알려 주면 그대로, 모르면 사용자가 고른다
      const known = X.cond?.(b.if);
      if (known === true) return run(i, true);
      if (known === false) { X.log.push({ t: 'note', text: `조건 거짓 (대상에서): ${b.if}` }); return elseOf(i, b); }
      X.wait = { t: 'cond', i, cond: String(b.if) }; return;
    }
    if (b.say || b.act) X.log.push({ t: 'say', role: b.role, text: b.say ?? '', act: b.act, pop: b.pop, fx: b.fx, to: b.to });
    if (b.choices) { X.wait = { t: 'choice', i, choices: b.choices, small: !!b.small }; return; }
    if (b.act && mini(b.act, () => after(i, b, null))) return;
    after(i, b, null);
  }
  function elseOf(i, b) { const j = b.else != null ? goto(b.else) : i + 1; if (j >= 0 && beat(j)) run(j); else finish('(끝 이름 없음)'); }

  return {
    // st = 한 장의 꼴(넘김-3 4절) · state = { cond(text) → true|false|undefined } — 대상의 조건으로 참 · 거짓을 아는 만큼
    start(one, state = {}) {
      st = one; X = { id: one.id, log: [], wait: null, done: null, result: null, cond: state.cond };
      if (!one.beats?.length) finish('(비트 없음)'); else run(0);
      return this.state();
    },
    choose(k) {
      const w = X?.wait; if (!w || w.t !== 'choice') return this.state();
      const b = beat(w.i), c = b.choices[k]; X.wait = null;
      X.log.push({ t: 'pick', text: c.text, act: c.act });
      if (!(c.act && mini(c.act, () => after(w.i, b, c)))) after(w.i, b, c);
      return this.state();
    },
    // 조건 갈림 (cond: true|false) · 판의 결과 (hold: 단계 번호 · mash: true|false)
    answer(kind, v) {
      const w = X?.wait; if (!w) return this.state();
      if (kind === 'cond' && w.t === 'cond') {
        const b = beat(w.i); X.wait = null; X.log.push({ t: 'note', text: `조건 ${v ? '참' : '거짓'}: ${w.cond}` });
        if (v) run(w.i, true); else elseOf(w.i, b);
      } else if (kind === 'hold' && w.t === 'mini') {
        const s = w.steps[v]; X.wait = null; X.log.push({ t: 'note', kind: 'hold', event: s.event, amount: s.amount }); X.then();
      } else if (kind === 'mash' && w.t === 'mini') {
        X.wait = null; X.log.push({ t: 'note', text: v ? '〔연타 성공〕' : '〔연타 실패〕' }); X.then();
      }
      return this.state();
    },
    state() { return X && { id: X.id, log: X.log, wait: X.wait, done: X.done, result: X.result }; },
  };
}
