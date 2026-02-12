"use client";

import { useEffect, useRef } from "react";

export function MermaidView({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!ref.current) return;
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "base",
        themeVariables: {
          primaryColor: "#172433",
          primaryTextColor: "#e6edf4",
          primaryBorderColor: "#38bdf8",
          lineColor: "#2dd4bf",
          fontFamily: "IBM Plex Sans",
          background: "#0f1823",
        },
      });
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      const { svg } = await mermaid.render(id, code);
      if (!cancelled && ref.current) {
        ref.current.innerHTML = svg;
      }
    }
    render().catch(() => {
      if (ref.current) ref.current.textContent = code;
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return <div className="mermaid-box" ref={ref} />;
}
