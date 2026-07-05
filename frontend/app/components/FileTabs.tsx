"use client";

import { useRef } from "react";
import { openIssueCount, fileState, type OpenFile } from "../session";

/**
 * The open-file tab strip. A single horizontal row that scrolls, with the
 * scrollbar hidden — you drag the strip left/right to move through tabs when
 * there are more than fit. Each tab is one open file, carrying its own
 * independent work-log; the badge shows that file's still-open issue count.
 *
 * Drag-to-scroll vs click: we only start scrolling once the pointer has moved
 * past a small threshold, and we swallow the click that ends a real drag so
 * dragging never accidentally switches or closes a tab.
 */
export function FileTabs({
  files,
  activeFileId,
  onSwitch,
  onClose,
}: {
  files: OpenFile[];
  activeFileId: string;
  onSwitch: (fileId: string) => void;
  onClose: (fileId: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Drag state kept in a ref so pointer handlers don't trigger re-renders.
  const drag = useRef({
    active: false, // a pointer is down on the strip
    moved: false, // it has moved past the threshold → treat as a scroll drag
    startX: 0, // pointer x where the press began
    startScroll: 0, // scrollLeft where the press began
  });

  const DRAG_THRESHOLD = 5; // px of movement before a press becomes a drag

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const strip = stripRef.current;
    if (!strip) return;
    // Ignore anything but the primary (left / touch / pen) button.
    if (e.button !== 0) return;
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: strip.scrollLeft,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const strip = stripRef.current;
    if (!strip || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (!drag.current.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      drag.current.moved = true;
      // Capture the pointer so a fast drag that leaves the strip keeps working.
      strip.setPointerCapture(e.pointerId);
      strip.classList.add("file-tabs__strip--dragging");
    }
    if (drag.current.moved) {
      strip.scrollLeft = drag.current.startScroll - dx;
      e.preventDefault();
    }
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const strip = stripRef.current;
    if (strip) {
      strip.classList.remove("file-tabs__strip--dragging");
      if (strip.hasPointerCapture?.(e.pointerId)) {
        strip.releasePointerCapture(e.pointerId);
      }
    }
    drag.current.active = false;
    // Leave `moved` set until the click handler has had a chance to read it,
    // then clear it on the next tick.
    setTimeout(() => {
      drag.current.moved = false;
    }, 0);
  }

  // Swallow the click that concludes a real drag, so it doesn't switch tabs.
  function guardedSwitch(fileId: string) {
    if (drag.current.moved) return;
    onSwitch(fileId);
  }

  return (
    <nav className="file-tabs" aria-label="Open files">
      <div
        className="file-tabs__strip"
        ref={stripRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <ul className="file-tabs__list">
          {files.map((f) => {
            const open = openIssueCount(f);
            const state = fileState(f); // "fresh" | "open" | "clear"
            return (
              <li key={f.fileId} className="file-tab__wrap">
                <button
                  className={`file-tab file-tab--state-${state} ${
                    f.fileId === activeFileId ? "file-tab--active" : ""
                  }`}
                  onClick={() => guardedSwitch(f.fileId)}
                  aria-current={f.fileId === activeFileId ? "true" : undefined}
                >
                  <span
                    className={`file-tab__state-dot file-tab__state-dot--${state}`}
                    aria-hidden="true"
                  />
                  <span className="file-tab__name">{f.filename}</span>
                  {open > 0 && <span className="file-tab__badge">{open}</span>}
                </button>
                <button
                  className="file-tab__close"
                  onClick={() => {
                    if (drag.current.moved) return;
                    onClose(f.fileId);
                  }}
                  aria-label={`Close ${f.filename}`}
                  title={`Close ${f.filename}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
