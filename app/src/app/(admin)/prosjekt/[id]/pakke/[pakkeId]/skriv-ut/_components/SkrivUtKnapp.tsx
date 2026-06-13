"use client";

import { useEffect } from "react";

export function SkrivUtKnapp() {
  useEffect(() => {
    document.fonts.ready.then(() => window.print());
  }, []);

  return (
    <button
      type="button"
      className="nm-btn nm-btn-primær no-print"
      onClick={() => window.print()}
    >
      Skriv ut
    </button>
  );
}
