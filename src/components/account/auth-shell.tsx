import type { ReactNode } from "react";
export function AuthShell({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="container flex justify-center py-14 md:py-24">
      <div className="w-full max-w-md fade-in">
        {eyebrow && <p className="label mb-4">{eyebrow}</p>}
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        {intro && <div className="mt-3 text-sm text-muted">{intro}</div>}
        <div className="mt-10">{children}</div>
      </div>
    </div>
  );
}
