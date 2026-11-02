import { useEffect, useId, useState } from "react";
import { DPE_COULEUR } from "../lib/calc";
import { k, pct } from "../lib/format";
import type { Point } from "../lib/rules";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 22 L13 13 L18 18 L24 8" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Champ numérique avec unité. Accepte la virgule décimale. */
const fmtVal = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? "" : String(v).replace(".", ","));
const parseVal = (s: string) => { const raw = s.replace(/\s/g, "").replace(",", "."); if (raw === "") return undefined; const n = parseFloat(raw); return Number.isNaN(n) ? undefined : n; };

export function NumField(p: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; placeholder?: string }) {
  const id = useId();
  const [text, setText] = useState(fmtVal(p.value));
  useEffect(() => { if (parseVal(text) !== p.value) setText(fmtVal(p.value)); }, [p.value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label htmlFor={id}>
      {p.label}
      <div className="unit">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder={p.placeholder}
          onChange={(e) => { setText(e.target.value); p.onChange(parseVal(e.target.value)); }}
        />
        {p.unit && <span>{p.unit}</span>}
      </div>
    </label>
  );
}

export function SelectField<T extends string>(p: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  const id = useId();
  return (
    <label htmlFor={id}>
      {p.label}
      <select id={id} value={p.value} onChange={(e) => p.onChange(e.target.value as T)}>
        {p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function LineChart({ series, xLabel, label }: { series: { data: number[]; color: string; area?: boolean; name?: string }[]; xLabel: (i: number) => string; label: string }) {
  const W = 640, H = 240, L = 58, R = 14, T = 14, B = 30;
  const all = series.flatMap((s) => s.data);
  if (!all.length) return null;
  const nice = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v) || 1))); return Math.ceil(v / p) * p; };
  const minData = Math.min(...all), maxData = Math.max(...all);
  const top = nice(maxData);
  const bot = minData < 0 ? -nice(-minData) : series.some((s) => s.area) ? 0 : Math.max(0, Math.floor((minData * 0.9) / Math.pow(10, Math.floor(Math.log10(minData || 1)))) * Math.pow(10, Math.floor(Math.log10(minData || 1))));
  const n = series[0].data.length;
  const x = (i: number) => L + (W - L - R) * (n <= 1 ? 0.5 : i / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (v - bot) / (top - bot || 1));
  const step = Math.max(1, Math.ceil(n / 8));
  const ticks = Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0 || i === n - 1);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, 1, 2, 3, 4].map((kk) => {
          const v = bot + ((top - bot) * kk) / 4, yy = y(v);
          return <g key={kk}><line x1={L} x2={W - R} y1={yy} y2={yy} stroke="var(--line)" /><text x={L - 6} y={yy + 4} textAnchor="end">{k(v)}</text></g>;
        })}
        {ticks.map((i) => <text key={i} x={x(i)} y={H - 10} textAnchor="middle">{xLabel(i)}</text>)}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              {s.area && <polygon points={`${x(0)},${y(Math.max(bot, 0))} ${pts} ${x(n - 1)},${y(Math.max(bot, 0))}`} fill={s.color} fillOpacity={0.12} />}
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinejoin="round" />
              <circle cx={x(n - 1)} cy={y(s.data[n - 1])} r={4} fill={s.color} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Gauge({ ecart }: { ecart: number }) {
  const W = 600, c = Math.max(-30, Math.min(30, ecart)), x = (v: number) => 20 + ((W - 40) * (v + 30)) / 60;
  const zones: [number, number, string, number][] = [[-30, -12, "var(--warn)", 0.35], [-12, 3, "var(--good)", 0.45], [3, 10, "var(--warn)", 0.45], [10, 30, "var(--bad)", 0.45]];
  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${W} 76`} role="img" aria-label={`Écart au prix du marché : ${pct(ecart, 0)}`}>
        {zones.map(([a, b, col, o]) => <rect key={a} x={x(a)} y={26} width={x(b) - x(a)} height={10} fill={col} opacity={o} />)}
        <line x1={x(0)} x2={x(0)} y1={20} y2={42} stroke="var(--ink)" strokeWidth={1.5} />
        {[-30, -20, -10, 0, 10, 20, 30].map((v) => <text key={v} x={x(v)} y={58} textAnchor="middle">{v > 0 ? "+" : ""}{v} %</text>)}
        <path d={`M${x(c) - 7},8 L${x(c) + 7},8 L${x(c)},22 Z`} fill="var(--ink)" />
        <text x={x(c)} y={73} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>ce bien</text>
      </svg>
    </div>
  );
}

export function DpeBar({ dpe }: { dpe?: string }) {
  return (
    <div className="dpe" aria-hidden="true">
      {"ABCDEFG".split("").map((l) => <span key={l} className={l === dpe ? "on" : ""} style={{ background: DPE_COULEUR[l] }}>{l}</span>)}
    </div>
  );
}

export function Checks({ points }: { points: Point[] }) {
  return (
    <ul className="checks">
      {points.map((p, i) => (
        <li key={i} className={p.sev}><span className="sev" /><div><b>{p.titre}</b><p>{p.texte}</p></div></li>
      ))}
    </ul>
  );
}
