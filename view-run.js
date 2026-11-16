// 마 — 돌리기. 채우기(gen) · 굽기(bake) · 검사(--check)의 버튼과 기록 · 방금 쓴 돈 · 실패한 줄.
// 긴 명령은 작업 패널로 돈다 (기록이 남게). API 열쇠는 "있다 / 없다"만 보여 준다 — 내용은 읽지 않는다.
import { esc } from './ui.js';
import { askFill } from './view-plan.js';

const time = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const TONE = { ok: 'success', fail: 'danger', running: 'info', cancelled: 'warning', queued: 'info' };
const WORD = { ok: '끝남', fail: '실패', running: '도는 중', cancelled: '취소함', unknown: '모름', queued: '대기열에' };

export const runView = {
  html(M) {
    const S = M.S, list = M.store.cells().filter(M.store.fillable), real = M.store.backend.real ?? {}, calls0 = M.store.backend.calls ?? [], wait = Object.keys(S.pending).length, picked = S.cards.filter((c) => M.store.effStatus(c) === 'picked').length;
    const dis = (name) => (real[name] && !S.busy ? '' : 'disabled');
    const last = S.runs.find((r) => r.name === 'gen' && r.end);
    const runs = S.runs.map((r, i) => `<tr class="${r.fails?.length ? 'has-fails' : ''}">
      <td class="a-faint">${time(r.at)}</td><td>${esc(r.title)}</td>
      <td><span class="a-badge is-${TONE[r.status] ?? ''}">${WORD[r.status] ?? esc(r.status)}${r.code ? ` (${r.code})` : ''}</span></td>
      <td>${esc(r.summary ?? '')}</td>
      <td class="mk-r">${r.tokens ? r.tokens.toLocaleString() : ''}</td><td class="mk-r">${r.cost != null ? `$${r.cost.toFixed(4)}` : ''}</td>
      <td>${r.fails?.length ? `<button class="mk-link" data-act="fails" data-i="${i}">실패한 줄 ${r.fails.length}</button>` : ''}${r.job && M.env.openJobs ? ` <button class="mk-link" data-act="job" data-job="${esc(r.job)}">기록</button>` : ''}</td></tr>
      ${M.ui.failsOf === i && r.fails?.length ? `<tr class="mk-fails"><td></td><td colspan="6">${r.fails.map((f) => `<div>${esc(f)}</div>`).join('')}</td></tr>` : ''}`).join('');
    const calls = calls0.slice(0, 40).map((c) => `<tr><td class="a-faint">${time(c.at)}</td><td class="a-mono">${esc(c.name)}.py ${esc(c.args.join(' '))}</td>
      <td>${c.fake ? '<span class="a-badge is-warning">가짜</span>' : ''}${c.ok === false ? `<span class="a-badge is-danger" title="${esc(c.error ?? '')}">실패</span>` : ''}</td></tr>`).join('');
    const est = M.store.estimate(list);
    const fillCard = `<div class="mk-run-card"><h3>채우기 <span class="a-faint">gen</span></h3>
          <p>채울 수 있는 모자란 칸 <b>${list.length}</b> · 모자란 장 <b>${list.reduce((n, c) => n + c.missing, 0)}</b></p>
          <p>전부 채우면 <b>${est.cards}장</b>을 청한다 · 대략 <b>$${est.usd.toFixed(2)}</b> <span class="a-faint">(장당 약 $0.0025)</span></p>
          ${S.kind === 'launcher' ? `<p class="${S.caps.key ? '' : 'is-warn'}">API 열쇠 파일: <b>${S.caps.key ? '있다' : '없다'}</b> <span class="a-faint">(Tools/Pipeline/.key — 환경 변수 XAI_API_KEY 는 여기서 알 수 없다)</span></p>` : '<p>대기열에 넣으면 저장소의 자동 작업이 채운다. <span class="a-faint">열쇠는 저장소의 비밀 값 — 화면은 모른다</span></p>'}
          ${last ? `<p>방금 쓴 것: 토큰 <b>${(last.tokens ?? 0).toLocaleString()}</b>${last.cost != null ? ` · 돈 <b>$${last.cost.toFixed(4)}</b>` : ''}</p>` : ''}
          <button class="a-btn a-primary" data-act="fill" ${S.caps.fill && !S.busy && list.length ? '' : 'disabled'}>모자란 칸 채우기 — 전부</button></div>`;
    // 저장소의 자동 작업이 방금 한 일 (밖의 길 — Cards/_index/last.json): 반영됨 · 몇 장 통과 · 얼마 씀 · 문제
    const L = S.last;
    const lastCard = L ? `<div class="mk-run-card mk-last"><h3>자동 작업이 방금 한 일 <span class="a-faint">${L.at ? esc(time(L.at)) : ''}</span></h3>
          <p>반영된 고르기 <b>${(L.picked ?? []).length}</b>${(L.missing ?? []).length ? ` · 못 찾은 카드 <b>${L.missing.length}</b>` : ''} · 대기열 <b>${(L.inbox ?? []).length}</b>건</p>
          ${(L.fills ?? []).length ? `<p>채운 묶음 <b>${L.fills.length}</b> · 통과 <b>${L.fills.reduce((n, f) => n + (f.ok ?? 0), 0)}</b>장 · 쓴 돈 <b>$${(L.usd ?? 0).toFixed(3)}</b></p>
            <table class="a-table">${L.fills.map((f) => `<tr><td class="a-mono">${esc(f.category)}</td><td>${esc(f.prev ?? '-')}</td><td>${esc(f.level ?? '')}</td><td class="mk-r">${f.ok ?? 0} / ${f.asked ?? 0}</td><td class="mk-r">$${(f.usd ?? 0).toFixed(3)}</td></tr>`).join('')}</table>` : ''}
          ${L.baked ? `<p>굽기: ${esc(L.baked)}</p>` : ''}
          ${(L.problems ?? []).length ? `<div class="mk-problems">${L.problems.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : '<p class="a-faint">문제 없음</p>'}</div>` : '';
    return `<div class="mk-scroll" data-scroll="run"><div class="mk-pad mk-run">
      <div class="mk-run-cards">
        ${fillCard}${lastCard}
        ${S.caps.bake ? `<div class="mk-run-card"><h3>검사 <span class="a-faint">bake --check</span></h3><p>굽지 않고 카드만 검사한다.</p><button class="a-btn" data-act="check" ${dis('bake')}>검사</button></div>
        <div class="mk-run-card"><h3>굽기 <span class="a-faint">bake</span></h3><p>살린 카드 <b>${picked}</b>장이 굽기를 기다린다 — 구우면 게임에 들어간다.</p>
          ${wait && S.caps.deferred ? `<p class="is-warn">그 가운데 고르기 <b>${wait}</b>건은 아직 카드에 적히지 않았다 (pick.py 없음). 굽기에 안 들어간다.</p>` : ''}
          <button class="a-btn a-primary" data-act="bake" ${dis('bake')}>굽기</button></div>
        <div class="mk-run-card"><h3>명령</h3><p class="mk-cmds">${Object.entries(real).map(([k, v]) => `<span class="a-badge ${v ? 'is-success' : 'is-warning'}" title="${v ? `Tools/Pipeline/${k}.py` : '없음 — 가짜 응답'}">${k}${v ? '' : ' 없음'}</span>`).join(' ')}</p>
          ${M.env.openJobs ? '<button class="a-btn" data-act="jobs">작업 패널</button>' : ''}</div>` : '<div class="mk-run-card"><h3>굽기</h3><p>밖에서는 따로 굽지 않는다 — 고르기가 반영될 때 저장소의 자동 작업이 같이 굽는다.</p></div>'}
      </div>
      <h3 class="mk-h">돌린 기록</h3>
      ${runs ? `<div class="mk-xscroll"><table class="a-table mk-runs"><thead><tr><th>언제</th><th>무엇</th><th>결과</th><th>셈</th><th class="mk-r">토큰</th><th class="mk-r">돈</th><th></th></tr></thead><tbody>${runs}</tbody></table></div>` : '<div class="a-faint">아직 돌린 것이 없습니다</div>'}
      ${calls ? `<h3 class="mk-h">부른 명령</h3><table class="a-table mk-calls"><tbody>${calls}</tbody></table>` : ''}
    </div></div>`;
  },
  act(M, a, t) {
    if (a === 'jobs') return M.env.openJobs();
    if (a === 'job') return M.env.openJobs(t.dataset.job);
    if (a === 'fails') { M.ui.failsOf = M.ui.failsOf === +t.dataset.i ? null : +t.dataset.i; return M.redraw(); }
    if (a === 'check') return M.store.bake(true);
    if (a === 'bake') return M.store.bake(false);
    if (a === 'fill') return askFill(M, null);
  },
};
