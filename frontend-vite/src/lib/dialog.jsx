'use client';

// 브라우저 기본 alert/confirm 을 대신하는 앱 공용 작은 창.
// 레이아웃이 라우트마다 달라 Provider 대신 첫 호출 때 document.body 에 스스로 마운트한다.
// 여러 호출은 큐에 쌓여 하나씩 순서대로 뜬다.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

let queue = [];
let seq = 0;
let mounted = false;
let returnFocus = null;
let lastFocus = null;
const listeners = new Set();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getHead = () => queue[0] || null;
const getQueued = () => queue.length;

function ensureHost() {
  if (mounted) return;
  mounted = true;
  const el = document.createElement('div');
  el.id = 'aop-dialog-root';
  document.body.appendChild(el);
  createRoot(el).render(<DialogHost />);
}

function enqueue(kind, message, opts = {}) {
  if (typeof document === 'undefined') return Promise.resolve(kind === 'confirm' ? false : undefined);
  return new Promise((resolve) => {
    const active = document.activeElement;
    // 처리 중(busy) 버튼이 비활성화돼 포커스가 body 로 빠졌으면 직전 복귀 대상을 다시 쓴다.
    const cand = active && active !== document.body ? active : lastFocus;
    if (!returnFocus && cand && cand.isConnected && !cand.closest?.('#aop-dialog-root')) returnFocus = cand;
    queue = [...queue, { id: ++seq, kind, message: message == null ? '' : String(message), opts, resolve }];
    ensureHost();
    emit();
  });
}

const ERROR_RE = /(실패|오류|에러|error|exception|fail|mismatch|차단)/i;
const SUCCESS_RE = /(완료|성공|success|saved|되었습니다)/i;
const WARN_RE = /(선택하|입력하|하세요|하십시오|please|없습니다|없음|limit|not |nothing|지원하지)/i;
const DANGER_RE = /(삭제|delete|덮어|overwrite|다시 만듭니다|버립니다|discard)/i;

function inferTone(kind, message) {
  if (kind === 'confirm') return DANGER_RE.test(message) ? 'danger' : 'question';
  if (ERROR_RE.test(message)) return 'error';
  if (SUCCESS_RE.test(message)) return 'success';
  if (WARN_RE.test(message)) return 'warning';
  return 'info';
}

const TITLES = { info: '알림', success: '완료', warning: '확인 필요', error: '오류', question: '확인', danger: '주의' };

/** 알림 창. 닫힐 때 resolve 된다. opts: { title, tone: info|success|warning|error, okText } */
export const showAlert = (message, opts) => enqueue('alert', message, opts);
/** 오류 알림. Error 객체나 문자열을 받는다. */
export const showError = (err, opts) => enqueue('alert', err?.message || String(err ?? ''), { tone: 'error', ...opts });
/** 확인 창. 확인=true, 취소/Esc=false 로 resolve 된다. opts: { title, tone: question|danger, okText, cancelText } */
export const showConfirm = (message, opts) => enqueue('confirm', message, opts);
/** 여러 메시지를 순서대로 보여 주고 마지막 창이 닫히면 resolve 된다. */
export const showAlerts = (messages, opts) =>
  (messages || []).reduce((p, m) => p.then(() => showAlert(m, opts)), Promise.resolve());

const ICONS = {
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-5M12 8h.01" /></>,
  success: <><circle cx="12" cy="12" r="10" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  warning: <><path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  error: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
  question: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  danger: <><path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
};

function DialogHost() {
  const head = useSyncExternalStore(subscribe, getHead, () => null);
  const count = useSyncExternalStore(subscribe, getQueued, () => 0);
  if (!head) return null;
  return <DialogBox key={head.id} d={head} pending={count - 1} />;
}

function DialogBox({ d, pending }) {
  const boxRef = useRef(null);
  const okRef = useRef(null);
  const doneRef = useRef(false);
  const isConfirm = d.kind === 'confirm';
  const tone = d.opts.tone || inferTone(d.kind, d.message);
  const title = d.opts.title || TITLES[tone] || TITLES.info;

  const close = (value) => {
    if (doneRef.current) return;
    doneRef.current = true;
    queue = queue.slice(1);
    if (queue.length === 0) {
      // 연속 호출(showAlerts 등)로 다음 창이 곧바로 뜨면 포커스를 뒤 화면으로 돌리지 않는다.
      setTimeout(() => {
        if (queue.length > 0) return;
        const back = returnFocus;
        returnFocus = null;
        lastFocus = back;
        if (back && back.isConnected && typeof back.focus === 'function') back.focus();
      }, 0);
    }
    emit();
    d.resolve(isConfirm ? value : undefined);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    okRef.current?.focus();
    // 창이 떠 있는 동안 키 입력이 뒤 화면(그리드·VbModal Esc 등)으로 가지 않게 캡처 단계에서 막는다.
    const onKey = (e) => {
      const box = boxRef.current;
      if (!box) return;
      if (e.type === 'keyup') {
        if (!box.contains(document.activeElement)) { e.preventDefault(); e.stopPropagation(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(false); return; }
      if (e.key === 'Enter' && e.repeat) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'Tab') {
        const btns = [...box.querySelectorAll('button')];
        if (btns.length === 0) return;
        const i = btns.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : (i === btns.length - 1 ? 0 : i + 1);
        e.preventDefault();
        btns[next].focus();
      } else if (e.key === 'Enter' && !box.contains(document.activeElement)) {
        e.preventDefault();
        closeRef.current(true);
      }
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, []);

  const okText = d.opts.okText || '확인';
  const cancelText = d.opts.cancelText || '취소';
  return (
    <div className="aop-dlg-backdrop" data-testid="app-dialog-backdrop">
      <div
        ref={boxRef}
        className={`aop-dlg aop-dlg--${tone}`}
        role={isConfirm || tone === 'error' || tone === 'warning' || tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`aop-dlg-title-${d.id}`}
        aria-describedby={`aop-dlg-msg-${d.id}`}
        data-testid="app-dialog"
        data-kind={d.kind}
        data-tone={tone}
      >
        <div className="aop-dlg__head">
          <span className="aop-dlg__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[tone] || ICONS.info}</svg>
          </span>
          <h2 className="aop-dlg__title" id={`aop-dlg-title-${d.id}`}>{title}</h2>
          {pending > 0 && <span className="aop-dlg__badge" title="대기 중인 알림">+{pending}</span>}
        </div>
        <div className="aop-dlg__msg" id={`aop-dlg-msg-${d.id}`} data-testid="app-dialog-message">{d.message}</div>
        <div className="aop-dlg__actions">
          {isConfirm && (
            <button type="button" className="aop-dlg__btn aop-dlg__btn--ghost" data-testid="app-dialog-cancel" onClick={() => close(false)}>
              {cancelText}
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            className={`aop-dlg__btn ${tone === 'danger' ? 'aop-dlg__btn--danger' : 'aop-dlg__btn--primary'}`}
            data-testid="app-dialog-ok"
            onClick={() => close(true)}
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}
