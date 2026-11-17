import type { ReactNode } from "react";
export function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-sans text-2xl font-medium">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {action}
    </div>
  );
}
export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="p-8 text-center text-sm text-muted">Nenhum registro.</p>}
    </div>
  );
}
export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`whitespace-nowrap px-4 py-3 ${className}`}>{children}</td>;
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="card p-5"><p className="label">{label}</p><p className="mt-3 text-2xl">{value}</p>{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</div>;
}
