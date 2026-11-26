"use client";
import { useMemo, useRef, useState } from "react";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: c >= 1_000_000 ? 0 : 2 });
const compact = (c: number) => { const v = c / 100; return Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }); };
const niceMax = (v: number) => { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)); const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v)!; return n * p; };

export type TimePoint = { key: string; label: string; revenue: number; profit: number; orders: number };

/** Faturamento × lucro no tempo (mesma unidade, um eixo). Passe o mouse para ver cada ponto. */
export function TimeChart({ points, bucketLabel }: { points: TimePoint[]; bucketLabel: string }) {
  const W = 760, H = 260, L = 56, R = 16, T = 16, B = 30;
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const { max, min, x, y } = useMemo(() => {
    const vals = points.flatMap((p) => [p.revenue, p.profit]);
    const mx = niceMax(Math.max(...vals, 0)), mn = Math.min(0, ...vals);
    const minN = mn < 0 ? -niceMax(-mn) : 0;
    return { max: mx, min: minN, x: (i: number) => L + (points.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1)), y: (v: number) => T + ((mx - v) * (H - T - B)) / (mx - minN || 1) };
  }, [points]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const path = (k: "revenue" | "profit") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const area = `${path("revenue")} L${x(points.length - 1).toFixed(1)},${y(Math.max(0, min))} L${x(0).toFixed(1)},${y(Math.max(0, min))} Z`;
  const every = Math.max(1, Math.ceil(points.length / 10));
  const onMove = (e: React.MouseEvent) => {
    const r = svg.current!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (points.length - 1)); setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const h = hover != null ? points[hover] : null;
  return (
    <div className="relative" data-time-chart>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: "#257de0" }} />Faturamento</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: "#f47230" }} />Lucro</span>
        <span className="ml-auto">por {bucketLabel}</span>
      </div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img" aria-label="Faturamento e lucro no período" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#ebe8e2" strokeWidth={1} /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#7a7a74">{compact(t)}</text></g>)}
        <path d={area} fill="#257de0" opacity={0.1} />
        <path d={path("revenue")} fill="none" stroke="#257de0" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path("profit")} fill="none" stroke="#f47230" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => i % every === 0 && <text key={p.key} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#7a7a74">{p.label}</text>)}
        {points.length > 0 && <>
          <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].revenue)} r={4} fill="#257de0" stroke="#fff" strokeWidth={2} />
          <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].profit)} r={4} fill="#f47230" stroke="#fff" strokeWidth={2} />
        </>}
        {h && <g pointerEvents="none">
          <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="#1f2522" strokeOpacity={0.25} strokeWidth={1} />
          <circle cx={x(hover!)} cy={y(h.revenue)} r={5} fill="#257de0" stroke="#fff" strokeWidth={2} />
          <circle cx={x(hover!)} cy={y(h.profit)} r={5} fill="#f47230" stroke="#fff" strokeWidth={2} />
        </g>}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-8 z-10 rounded border border-line bg-white px-3 py-2 text-xs shadow-lg" style={{ left: `clamp(0px, calc(${(x(hover!) / W) * 100}% - 80px), calc(100% - 170px))` }} role="status">
          <p className="font-medium">{h.label}</p>
          <p className="mt-1 flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: "#257de0" }} />Faturamento <b className="ml-auto pl-3 font-medium">{brl(h.revenue)}</b></p>
          <p className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: "#f47230" }} />Lucro <b className="ml-auto pl-3 font-medium">{brl(h.profit)}</b></p>
          <p className="text-muted">{h.orders} venda(s)</p>
        </div>
      )}
    </div>
  );
}

/** Colunas simples (uma série) com dica ao passar o mouse e o maior valor rotulado. */
export function Columns({ data, valueLabel, format = "count" }: { data: { label: string; value: number; sub?: string }[]; valueLabel: string; format?: "count" | "money" }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(360, data.length * 18), H = 190, T = 22, B = 24, gap = 2;
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const bw = Math.min(24, (W / data.length) - gap * 4);
  const top = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0);
  const fmt = (v: number) => (format === "money" ? brl(v) : v.toLocaleString("pt-BR"));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={valueLabel}>
        <line x1={0} x2={W} y1={H - B} y2={H - B} stroke="#ebe8e2" />
        {data.map((d, i) => {
          const cx = ((i + 0.5) * W) / data.length, h = ((H - T - B) * d.value) / max, x0 = cx - bw / 2, y0 = H - B - h;
          const r = Math.min(4, h);
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - W / data.length / 2} y={0} width={W / data.length} height={H} fill="transparent" />
              {h > 0 && <path d={`M${x0},${H - B} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${H - B} Z`} fill="#257de0" opacity={hover == null || hover === i ? 1 : 0.45} />}
              {i === top && d.value > 0 && <text x={cx} y={y0 - 6} textAnchor="middle" fontSize={11} fill="#1f2522">{fmt(d.value)}</text>}
              <text x={cx} y={H - 7} textAnchor="middle" fontSize={11} fill="#7a7a74">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-0 z-10 rounded border border-line bg-white px-3 py-1.5 text-xs shadow-lg" style={{ left: `clamp(0px, calc(${((hover + 0.5) / data.length) * 100}% - 60px), calc(100% - 140px))` }}>
          <b className="font-medium">{data[hover].label}</b> · {fmt(data[hover].value)} {valueLabel}{data[hover].sub ? <div className="text-muted">{data[hover].sub}</div> : null}
        </div>
      )}
    </div>
  );
}
