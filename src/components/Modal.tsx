"use client";

/**
 * 창(모달) 공통 부품
 *
 * 예전에는 화면마다 이렇게 직접 그렸다.
 *
 *   <div className="modal-back" onClick={onClose}>
 *     <div className="modal" onClick={(e) => e.stopPropagation()}>
 *
 * 보이는 모양은 맞지만 창이 갖춰야 할 것이 빠져 있었다. Esc 로 닫히지 않아
 * 마우스로만 닫을 수 있었고, Tab 을 누르면 커서가 뒤쪽 화면으로 새어 나갔고,
 * 화면낭독기는 "창이 열렸다"는 말을 못 했고, 창 뒤 목록이 같이 스크롤됐다.
 *
 * 열한 군데가 같은 방식으로 빠져 있었다 — 그래서 화면마다 고치는 대신
 * 창이라는 개념을 한 곳에 두고 전부 이 부품을 쓰게 했다.
 *
 * 여기서 책임지는 것
 *   · Esc 로 닫기
 *   · Tab 이 창 안에서만 돌게 가두기 (앞뒤 모두)
 *   · 열릴 때 창 안으로 커서 옮기고, 닫으면 원래 있던 자리로 되돌리기
 *   · 창 뒤 화면 스크롤 잠그기
 *   · role="dialog" · aria-modal · 창 이름 붙이기
 *   · 창 위에 창이 겹쳐도 맨 위 창만 반응하기
 */

import { useEffect, useRef, type ReactNode } from "react";

/** 지금 열려 있는 창들 — 맨 뒤가 맨 위에 있는 창이다 */
const stack: symbol[] = [];

/** 스크롤을 잠그기 직전의 body 값 — 첫 창이 열릴 때만 기억한다 */
let savedOverflow = "";

function lockScroll() {
  if (stack.length === 1) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockScroll() {
  if (stack.length === 0) document.body.style.overflow = savedOverflow;
}

/** 커서가 갈 수 있는 것들. 숨겨졌거나 잠긴 것은 뺀다 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

type Props = {
  onClose: () => void;
  /**
   * 창 이름 — 화면낭독기가 창이 열릴 때 읽어준다.
   * 창 안의 제목과 같은 말로 적는다.
   */
  label: string;
  /** 너비 — 기본 344 · wide 620 · xl 880 */
  size?: "sm" | "wide" | "xl";
  /** 다른 창 위에 겹쳐 뜨는 창인가 */
  top?: boolean;
  children: ReactNode;
};

export default function Modal({ onClose, label, size = "sm", top, children }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  // 최신 onClose 를 붙잡아 둔다 — 아래 효과를 한 번만 걸기 위해서다
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const me = Symbol("modal");
    stack.push(me);
    lockScroll();

    /** 지금 이 창이 맨 위인가 — 겹쳐 뜬 창이 있으면 아래 창은 가만히 있는다 */
    const isTop = () => stack[stack.length - 1] === me;

    // 열기 전에 어디에 있었는지 기억해 둔다
    const cameFrom = document.activeElement as HTMLElement | null;

    // 창 안으로 커서를 옮긴다. 넣을 곳이 없으면 창 자체가 받는다
    const box = boxRef.current;
    const first = box ? focusablesIn(box)[0] : null;
    (first ?? box)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (!isTop()) return;

      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }

      if (e.key !== "Tab" || !box) return;

      // Tab 을 창 안에 가둔다 — 끝에서 한 번 더 누르면 처음으로 돌아온다
      const items = focusablesIn(box);
      if (items.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const here = document.activeElement;

      if (e.shiftKey && (here === head || here === box)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && here === tail) {
        e.preventDefault();
        head.focus();
      } else if (here instanceof Node && !box.contains(here)) {
        // 어쩌다 창 밖으로 나가 있으면 도로 데려온다
        e.preventDefault();
        head.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      stack.splice(stack.indexOf(me), 1);
      unlockScroll();
      // 원래 있던 자리로 커서를 되돌린다. 목록에서 창을 열었다면 그 줄로 돌아간다
      cameFrom?.focus?.();
    };
  }, []);

  return (
    <div
      className={`modal-back${top ? " top" : ""}`}
      // 바탕을 눌러 닫는다. 창 안에서 시작한 드래그가 바탕에서 끝났을 때
      // 닫히지 않도록, 누른 곳과 뗀 곳이 모두 바탕일 때만 닫는다
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.dataset.from = "back";
        else delete e.currentTarget.dataset.from;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && e.currentTarget.dataset.from === "back") onClose();
      }}
    >
      <div
        ref={boxRef}
        className={`modal${size === "sm" ? "" : ` ${size}`}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
