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
          primaryColor: "#fff4d6",
          primaryTextColor: "#1f2937",
          primaryBorderColor: "#f59e0b",
          lineColor: "#0f766e",
          fontFamily: "IBM Plex Sans",
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
