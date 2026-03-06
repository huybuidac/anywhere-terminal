// src/webview/SplitResizeHandle.ts — Drag-to-Resize Handle Logic
//
// Attaches pointer-based drag resize behavior to split handle elements.
// Uses setPointerCapture for reliable drag tracking.
//
// See: specs/split-resize-handles/spec.md, design.md#Resize-Handle-Drag-Flow

import type { SplitDirection } from "./SplitModel";

// ─── Constants ──────────────────────────────────────────────────────

/** Minimum pane size in pixels — neither child can be smaller than this. */
const MIN_PANE_SIZE = 80;

// ─── Types ──────────────────────────────────────────────────────────

/** Callbacks invoked during and after resize. */
export interface ResizeCallbacks {
  /** Called after drag ends with the new ratio. */
  onRatioChange: (newRatio: number) => void;
  /** Called after drag ends to trigger re-fit of all affected leaf terminals. */
  onResizeComplete: () => void;
}

// ─── Attach Resize Handle ───────────────────────────────────────────

/**
 * Attach drag-to-resize behavior to a handle element.
 *
 * @param handle The resize handle div (div.split-handle)
 * @param branchEl The parent branch container (div.split-branch)
 * @param direction The split direction ('horizontal' | 'vertical')
 * @param callbacks Callbacks for ratio change and resize completion
 * @returns A cleanup function to remove all event listeners
 */
export function attachResizeHandle(
  handle: HTMLElement,
  branchEl: HTMLElement,
  direction: SplitDirection,
  callbacks: ResizeCallbacks,
): () => void {
  const cursor = direction === "vertical" ? "col-resize" : "row-resize";

  function onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);

    // Set cursor on body to prevent flickering during drag
    document.body.style.cursor = cursor;

    const firstChild = branchEl.children[0] as HTMLElement;
    const secondChild = branchEl.children[2] as HTMLElement;

    function onPointerMove(e: PointerEvent): void {
      const rect = branchEl.getBoundingClientRect();

      let ratio: number;
      if (direction === "vertical") {
        // Vertical split: side-by-side, use clientX
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        // Horizontal split: top-to-bottom, use clientY
        ratio = (e.clientY - rect.top) / rect.height;
      }

      // Clamp to enforce minimum pane size
      const containerSize = direction === "vertical" ? rect.width : rect.height;
      const minRatio = MIN_PANE_SIZE / containerSize;
      const maxRatio = (containerSize - MIN_PANE_SIZE) / containerSize;
      ratio = Math.max(minRatio, Math.min(maxRatio, ratio));

      // Update flex styles on children
      firstChild.style.flex = String(ratio);
      secondChild.style.flex = String(1 - ratio);
    }

    function onPointerEnd(e: PointerEvent): void {
      handle.releasePointerCapture(e.pointerId);
      document.body.style.cursor = "";

      // Calculate final ratio from current flex values
      const finalRatio = Number.parseFloat(firstChild.style.flex) || 0.5;

      // Remove move/end listeners
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerEnd);
      handle.removeEventListener("pointercancel", onPointerEnd);

      // Notify callbacks
      callbacks.onRatioChange(finalRatio);
      callbacks.onResizeComplete();
    }

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerEnd);
    handle.addEventListener("pointercancel", onPointerEnd);
  }

  handle.addEventListener("pointerdown", onPointerDown);

  // Return cleanup function
  return () => {
    handle.removeEventListener("pointerdown", onPointerDown);
  };
}
