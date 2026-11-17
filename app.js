// ST 메이커의 화면 (D-052 · docs/넘김-2026-11-16-ST메이커.md).
//   사용자가 패턴 · 카테고리 · 줄거리에 주문 한 줄씩 적으면 → 모자란 칸이 표로 보이고 → 버튼 하나로 채워지고 → 후보에서 고르면 → 게임에 들어간다.
//   화면 다섯: 가 일감 표 · 나 고르기 · 다 줄거리 표 · 라 주문서 · 마 돌리기.
//   이 폴더는 스스로 선다 — 런처의 패널(index.js)에서도, 따로 연 페이지(index.html — 밖 · 폰)에서도 같은 화면이 돈다. 데이터 길은 backends.js.
import { esc, confirmBox } from './ui.js';
import { benchView } from './view-bench.js';
import { planView } from './view-plan.js';
import { pickView } from './view-pick.js';
import { storyView } from './view-story.js';
import { ordersView } from './view-orders.js';
import { runView } from './view-run.js';

const VIEWS = [
  { id: 'bench', title: '작업대', view: benchView },
  { id: 'plan', title: '일감 표', view: planView },
  { id: 'pick', title: '고르기', view: pickView },
  { id: 'story', title: '줄거리 표', view: storyView },
  { id: 'orders', title: '주문서', view: ordersView },
  { id: 'run', title: '돌리기', view: runView },
];
const typing = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(t.type)));
const NARROW = 760;                                           // 이보다 좁으면 폰 꼴 (한 줄로 쌓고, 고르기는 한 장씩)

// el 안에 화면을 붙인다. env = { settings: { get, set }, openJobs?(id), logout?() } → 치우는 함수
export function mountMaker(el, store, env) {
  {
    {
      el.innerHTML = '<div class="mk" tabindex="-1"><nav class="mk-nav"></nav><div class="mk-err" hidden></div><div class="mk-body"></div></div>';
      const root = el.firstChild, nav = root.children[0], err = root.children[1], body = root.children[2];
      // M = 화면들이 같이 쓰는 것: 저장소 · 지금 보는 화면 · 화면마다의 고른 것(ui)
      const M = { store, S: store.S, env, view: env.settings.get('view3', 'bench'), narrow: el.clientWidth > 0 && el.clientWidth < NARROW, ui: { rows: new Set(), touched: new Set(), side: true },
        go(view, patch) { Object.assign(M.ui, patch ?? {}); M.view = view; env.settings.set('view3', view); draw(); if (!typing(document.activeElement)) root.focus({ preventScroll: true }); },
        redraw: () => draw(), confirm: (opts) => confirmBox(root, opts) };
      const cur = () => (VIEWS.find((v) => v.id === M.view) ?? VIEWS[0]).view;

      function drawNav() {
        const S = store.S;
        const fake = Object.entries(store.backend.real ?? {}).filter(([k, v]) => !v && ['plan', 'cards', 'pick', 'shapes'].includes(k)).map(([k]) => k);
        const wait = Object.keys(S.pending).length;
        nav.innerHTML = `<div class="mk-tabs">${VIEWS.filter((v) => v.id !== 'run' || S.caps.fill || S.caps.bake).map((v) => `<button class="mk-tab ${M.view === v.id ? 'is-on' : ''}" data-view="${v.id}">${esc(v.title)}</button>`).join('')}</div>
          <span class="mk-grow"></span>
          ${S.busy ? `<span class="a-badge is-info">도는 중 — ${esc(S.busy)}</span>` : ''}
          ${wait ? `<span class="a-badge is-warning" title="${S.caps.deferred ? '고르기는 대기열로 나갔다 — 저장소에 반영되면(1분쯤) 사라진다' : '고르기를 내보내는 중'}">${S.caps.deferred ? '반영을 기다리는 고르기' : '내보내는 고르기'} ${wait}</span>` : ''}
          ${S.kind === 'github' ? `<span class="a-badge mk-where" title="밖에서 — GitHub 로 읽고 쓴다">${esc(S.label)}</span>` : ''}
          ${S.kind === 'fixtures' ? '<span class="a-badge is-warning">가짜 응답 (견본)</span>' : ''}
          ${S.ready && fake.length ? `<span class="a-badge is-warning" title="Tools/Pipeline 에 이 명령이 없어 Tools/Maker/fixtures 의 가짜 응답을 읽는다 — 명령이 생기면 스스로 바뀐다">가짜 응답: ${esc(fake.join(' · '))}</span>` : ''}
          <button class="a-btn" data-reload ${S.loading ? 'disabled' : ''}>다시 읽기</button>
          ${env.logout ? '<button class="a-btn" data-logout title="이 브라우저에 넣어 둔 토큰을 지운다">나가기</button>' : ''}`;
        err.hidden = !S.error; err.textContent = S.error ?? '';
        root.classList.toggle('is-narrow', M.narrow);
      }
      function draw() {
        drawNav();
        if (!store.S.ready) { body.innerHTML = `<div class="mk-empty">${store.S.loading ? '읽는 중…' : '읽지 못했습니다'}</div>`; return; }
        const keep = [...body.querySelectorAll('[data-scroll]')].map((n) => [n.dataset.scroll, n.scrollTop, n.scrollLeft]);
        body.className = `mk-body is-${M.view}`;
        body.innerHTML = cur().html(M);
        for (const [k, t, l] of keep) { const n = body.querySelector(`[data-scroll="${k}"]`); if (n) { n.scrollTop = t; n.scrollLeft = l; } }
        cur().after?.(M, body);
      }
      // 저장소가 바뀌면 다시 그린다 — 다만 사람이 손대는 중에는 미룬다:
      //   글을 치는 중(친 글 · 커서) · 누르는 중(누름과 뗌 사이에 화면이 바뀌면 그 누름이 사라진다) · 칸에서 칸으로 넘어가는 순간(Tab)
      let dirty = false, holding = false, queued = false;
      const here = () => (body.contains(document.activeElement) ? document.activeElement : null);
      const KEYS = ['f', 'k', 'level', 'row'];
      const apply = () => {
        queued = false;
        if (holding || typing(here())) { dirty = true; drawNav(); return; }
        dirty = false;
        const a = here(), k = a && KEYS.find((x) => a.dataset[x] != null);
        draw();
        if (k) body.querySelector(`[data-${k}="${CSS.escape(a.dataset[k])}"]`)?.focus({ preventScroll: true });   // 고르던 칸으로 되돌아감
      };
      const refresh = () => { if (!queued) { queued = true; setTimeout(apply, 0); } };
      body.addEventListener('focusout', () => { if (dirty) refresh(); });
      body.addEventListener('pointerdown', () => { holding = true; });
      const release = () => setTimeout(() => { holding = false; if (dirty) refresh(); }, 0);
      for (const type of ['pointerup', 'pointercancel', 'dragend']) addEventListener(type, release, true);
      nav.addEventListener('click', (e) => {
        const t = e.target.closest('[data-view]'); if (t) return M.go(t.dataset.view);
        if (e.target.closest('[data-reload]')) store.load();
        if (e.target.closest('[data-logout]')) env.logout();
      });
      body.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (t && !t.disabled) cur().act?.(M, t.dataset.act, t, e); });
      // 글 칸에서 Enter = 그 칸 옆의 버튼 (data-enter="동작 이름")
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || !e.target.dataset?.enter) return;
        e.preventDefault(); e.target.parentElement.querySelector(`[data-act="${e.target.dataset.enter}"]`)?.click();
      });
      body.addEventListener('input', (e) => cur().input?.(M, e.target, false));
      body.addEventListener('change', (e) => cur().input?.(M, e.target, true));
      for (const type of ['dragstart', 'dragover', 'dragleave', 'drop', 'dragend']) body.addEventListener(type, (e) => cur().drag?.(M, e));
      // 키: 이 패널이 보이고, 글 칸에 있지 않을 때만
      const onKey = (e) => {
        if (!root.isConnected || root.offsetParent === null || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.activeElement !== document.body && !root.contains(document.activeElement)) return;   // 다른 패널에 있을 때는 가만히
        if (document.querySelector('.anorak-dialog-back, .mk-modal-back')) return;
        if (cur().key?.(M, e)) { e.preventDefault(); e.stopPropagation(); }
      };
      document.addEventListener('keydown', onKey, true);
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) body.addEventListener(type, (e) => cur().pointer?.(M, e));
      const off = store.subscribe(refresh);
      // 폭이 문턱을 넘나들면 다시 그린다 (폰 꼴 ↔ 넓은 꼴)
      const ro = new ResizeObserver(() => { const n = el.clientWidth > 0 && el.clientWidth < NARROW; if (n !== M.narrow) { M.narrow = n; draw(); } });
      ro.observe(el);
      draw();
      if (!store.S.ready && !store.S.loading) store.load();
      return () => { off(); ro.disconnect(); document.removeEventListener('keydown', onKey, true); for (const type of ['pointerup', 'pointercancel', 'dragend']) removeEventListener(type, release, true); el.innerHTML = ''; };
    }
  }
}
