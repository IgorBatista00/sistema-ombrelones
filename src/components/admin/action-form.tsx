"use client";
import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/modules/admin/actions";
import { Button } from "@/components/ui/button";

/** Formulário de Server Action com feedback de sucesso/erro. */
export function ActionForm({ action, children, submit = "Salvar", className, confirm: confirmMsg }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: ReactNode; submit?: string; className?: string; confirm?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className} onSubmit={(e) => { if (confirmMsg && !confirm(confirmMsg)) e.preventDefault(); }}>
      {children}
      <div className="mt-4 flex items-center gap-4">
        <Button type="submit" disabled={pending} className="h-10 px-5">{pending ? "Salvando…" : submit}</Button>
        {state?.ok && <span role="status" className="text-sm text-success">Salvo.</span>}
        {state?.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
