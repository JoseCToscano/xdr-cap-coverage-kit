"use client";
import { useState } from "react";

export function CopyBlock({ code, label }: { code: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="code">
      <div className="code-h">
        <span className="label">{label}</span>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  );
}
