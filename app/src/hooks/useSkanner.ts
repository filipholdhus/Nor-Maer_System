"use client";

import { useEffect, useRef } from "react";

// Listens for handheld-scanner keyboard events globally.
// Scanners emit rapid keystrokes ending with Enter; regular typing is slower.
// Ignores input while a form element has focus so PIN pads still work.
export function useSkanner(
  onSkann: (verdi: string) => void | Promise<void>,
  aktiv: boolean
): void {
  const cbRef = useRef(onSkann);

  // Keep callback fresh after every render without re-registering the listener
  useEffect(() => {
    cbRef.current = onSkann;
  });

  useEffect(() => {
    if (!aktiv) return;

    let buffer = "";
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Enter") {
        if (clearTimer !== null) { clearTimeout(clearTimer); clearTimer = null; }
        const verdi = buffer.trim();
        buffer = "";
        if (verdi.length >= 3) void cbRef.current(verdi);
        return;
      }

      if (e.key.length !== 1) return; // ignore Shift, Ctrl, Arrow, etc.

      buffer += e.key;
      if (clearTimer !== null) clearTimeout(clearTimer);
      // Clear stale partial input if no new char arrives within 150 ms
      clearTimer = setTimeout(() => { buffer = ""; clearTimer = null; }, 150);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (clearTimer !== null) clearTimeout(clearTimer);
    };
  }, [aktiv]);
}
