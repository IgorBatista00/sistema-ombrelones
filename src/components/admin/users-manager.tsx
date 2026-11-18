"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createAdminUserAction, resetAdminUserPasswordAction, saveLevelMatrixAction, setAdminUserActiveAction, updateAdminUserAction } from "@/modules/admin/user-actions";
import { ADM_ONLY, AREAS, LEVELS, generateTempPassword, type AreaKey, type LevelMatrix } from "@/modules/admin-users/levels";

type U = { id: string; name: string; email: string; phone: string | null; active: boolean; lastLoginAt: string | null; createdAt: string; pendingPassword: boolean; level: string | null; levelLabel: string };
const inp = "mt-1 h-10 w-full rounded border border-line px-2";
const btn = "inline-flex h-9 items-center whitespace-nowrap rounded px-4 text-sm";

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"><h2 className="font-sans text-lg font-medium">{title}</h2>{children}</div>
    </div>
  );
}
const Err = ({ e }: { e: string | null }) => (e ? <p className="mt-3 rounded border border-danger/40 bg-danger/5 p-2 text-sm text-danger" role="alert">{e}</p> : null);

function LevelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="mt-3"><legend className="text-xs text-muted">Nível de acesso *</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">{LEVELS.map((l) => (
        <label key={l.key} className={`cursor-pointer rounded border p-3 text-sm ${value === l.key ? "border-ink bg-ink/[0.03]" : "border-line hover:border-ink/40"}`}>
          <span className="flex items-center gap-2"><input type="radio" name="level" value={l.key} checked={value === l.key} onChange={() => onChange(l.key)} /> <strong className="font-medium">{l.label}</strong></span>
          <span className="mt-1 block text-xs text-muted">{l.hint}</span>
        </label>))}</div>
    </fieldset>
  );
}

function PasswordField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="mt-3 block text-xs text-muted">{label}
      <span className="mt-1 flex gap-2"><input className="h-10 w-full rounded border border-line px-2 font-mono" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" spellCheck={false} />
        <button type="button" className={`${btn} border border-line hover:bg-ink/5`} onClick={() => onChange(generateTempPassword())}>Gerar</button></span>
      <span className="mt-1 block">Mínimo de 10 caracteres, com letras e números. Passe para a pessoa pessoalmente ou por mensagem; no primeiro acesso ela vai criar uma senha só dela.</span>
    </label>
  );
}

function useAct() {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void) => { setErr(null); start(async () => { const r = await fn(); if (!r.ok) return setErr(r.error ?? "Erro."); done(); router.refresh(); }); };
  return { err, pending, go, setErr };
}

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", level: "", password: "" });
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null);
  const { err, pending, go } = useAct();
  const close = () => { setOpen(false); setDone(null); };
  return (
    <>
      <button className={`${btn} h-10 bg-accent px-5 text-accent-ink`} onClick={() => { setF({ name: "", email: "", phone: "", level: "", password: generateTempPassword() }); setDone(null); setOpen(true); }} data-new-user>Novo usuário</button>
      {open && (
        <Dialog title={done ? "Usuário criado" : "Novo usuário"} onClose={close}>
          {done ? (
            <div className="mt-4 text-sm" data-user-created>
              <p>Passe estes dados para <strong className="font-medium">{done.name}</strong>:</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded border border-line bg-ink/[0.02] p-3"><dt className="text-muted">Endereço</dt><dd>{typeof window !== "undefined" ? `${window.location.origin}/entrar` : "/entrar"}</dd><dt className="text-muted">E-mail</dt><dd>{done.email}</dd><dt className="text-muted">Senha provisória</dt><dd className="font-mono">{done.password}</dd></dl>
              <p className="mt-3 text-xs text-muted">Esta senha não aparece de novo. No primeiro acesso, a pessoa vai criar uma senha própria. Se ela perder, use “Nova senha provisória”.</p>
              <div className="mt-4 flex justify-end"><button className={`${btn} bg-accent text-accent-ink`} onClick={close}>Concluir</button></div>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted sm:col-span-2">Nome *<input className={inp} value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
                <label className="text-xs text-muted">E-mail (login) *<input type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
                <label className="text-xs text-muted">Telefone<input className={inp} value={f.phone} maxLength={30} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
              </div>
              <LevelPicker value={f.level} onChange={(level) => setF({ ...f, level })} />
              <PasswordField label="Senha provisória *" value={f.password} onChange={(password) => setF({ ...f, password })} />
              <Err e={err} />
              <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={close}>Cancelar</button>
                <button className={`${btn} bg-accent text-accent-ink`} disabled={pending} onClick={() => go(() => createAdminUserAction(f), () => setDone({ name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.password }))}>{pending ? "Criando…" : "Criar usuário"}</button></div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}

export function UserRowActions({ u, self }: { u: U; self: boolean }) {
  const [open, setOpen] = useState<null | "edit" | "pwd" | "toggle">(null);
  const [f, setF] = useState({ name: u.name, phone: u.phone ?? "", level: u.level ?? "" });
  const [pwd, setPwd] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const { err, pending, go, setErr } = useAct();
  const close = () => { setOpen(null); setShown(null); setErr(null); };
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      <button className={`${btn} border border-line hover:bg-ink/5`} onClick={() => { setF({ name: u.name, phone: u.phone ?? "", level: u.level ?? "" }); setOpen("edit"); }} data-edit-user={u.email}>Editar</button>
      {!self && u.active && <button className={`${btn} hover:bg-ink/5`} onClick={() => { setPwd(generateTempPassword()); setOpen("pwd"); }} data-reset-user={u.email}>Nova senha provisória</button>}
      {!self && <button className={`${btn} ${u.active ? "text-danger hover:bg-danger/5" : "hover:bg-ink/5"}`} onClick={() => setOpen("toggle")} data-toggle-user={u.email}>{u.active ? "Desativar" : "Reativar"}</button>}
      {open === "edit" && (
        <Dialog title={`Editar ${u.name}`} onClose={close}>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted sm:col-span-2">Nome *<input className={inp} value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="text-xs text-muted">E-mail (login)<input className={`${inp} bg-ink/[0.03]`} value={u.email} disabled /></label>
            <label className="text-xs text-muted">Telefone<input className={inp} value={f.phone} maxLength={30} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          </div>
          <LevelPicker value={f.level} onChange={(level) => setF({ ...f, level })} />
          {self && <p className="mt-2 text-xs text-muted">Este é o seu usuário: o seu próprio nível Adm só pode ser alterado por outro Adm.</p>}
          <Err e={err} />
          <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={close}>Cancelar</button>
            <button className={`${btn} bg-accent text-accent-ink`} disabled={pending} onClick={() => go(() => updateAdminUserAction(u.id, f), close)}>{pending ? "Salvando…" : "Salvar"}</button></div>
        </Dialog>
      )}
      {open === "pwd" && (
        <Dialog title={`Nova senha provisória · ${u.name}`} onClose={close}>
          {shown ? (
            <div className="mt-4 text-sm"><p>Nova senha provisória de <strong className="font-medium">{u.email}</strong>:</p><p className="mt-2 rounded border border-line bg-ink/[0.02] p-3 font-mono text-base" data-temp-password>{shown}</p>
              <p className="mt-3 text-xs text-muted">As sessões abertas desta pessoa foram encerradas. No próximo acesso ela vai criar uma senha própria. Esta senha não aparece de novo.</p>
              <div className="mt-4 flex justify-end"><button className={`${btn} bg-accent text-accent-ink`} onClick={close}>Concluir</button></div></div>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">Use quando a pessoa esqueceu a senha. A senha atual deixa de funcionar na hora.</p>
              <PasswordField label="Senha provisória *" value={pwd} onChange={setPwd} />
              <Err e={err} />
              <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={close}>Cancelar</button>
                <button className={`${btn} bg-accent text-accent-ink`} disabled={pending} onClick={() => go(() => resetAdminUserPasswordAction(u.id, pwd), () => setShown(pwd))}>{pending ? "Salvando…" : "Definir senha"}</button></div>
            </>
          )}
        </Dialog>
      )}
      {open === "toggle" && (
        <Dialog title={`${u.active ? "Desativar" : "Reativar"} ${u.name}`} onClose={close}>
          <p className="mt-3 text-sm text-muted">{u.active ? "A pessoa sai do sistema na hora e não consegue mais entrar. O que ela já lançou (orçamentos, entregas, financeiro) continua registrado com o nome dela." : "A pessoa volta a entrar com a senha que já tinha, no nível de acesso atual."}</p>
          <Err e={err} />
          <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={close}>Voltar</button>
            <button className={`${btn} ${u.active ? "bg-danger text-white" : "bg-accent text-accent-ink"}`} disabled={pending} onClick={() => go(() => setAdminUserActiveAction(u.id, !u.active), close)}>{pending ? "Salvando…" : u.active ? "Desativar" : "Reativar"}</button></div>
        </Dialog>
      )}
    </span>
  );
}

export function LevelMatrixEditor({ initial, counts }: { initial: LevelMatrix; counts: Record<string, number> }) {
  const [m, setM] = useState<LevelMatrix>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const { err, pending, go } = useAct();
  const levels = LEVELS.filter((l) => l.key !== "ADM") as { key: keyof LevelMatrix; label: string }[];
  const toggle = (lv: keyof LevelMatrix, a: AreaKey) => { setMsg(null); setM((s) => ({ ...s, [lv]: s[lv].includes(a) ? s[lv].filter((x) => x !== a) : [...s[lv], a] })); };
  const dirty = JSON.stringify(m) !== JSON.stringify(initial);
  return (
    <div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr><th className="px-4 py-3 font-normal">Área do painel</th>{LEVELS.map((l) => <th key={l.key} className="px-4 py-3 text-center font-normal">{l.label}<span className="block normal-case tracking-normal">{counts[l.key] ?? 0} usuário(s)</span></th>)}</tr></thead>
          <tbody className="divide-y divide-line">{AREAS.map((a) => (
            <tr key={a.key} data-area={a.key}>
              <td className="px-4 py-3"><span className="font-medium">{a.label}</span>{a.hint && <span className="block text-xs text-muted">{a.hint}</span>}</td>
              <td className="px-4 py-3 text-center"><input type="checkbox" checked disabled aria-label={`Adm · ${a.label}`} /></td>
              {levels.map((l) => (
                <td key={l.key} className="px-4 py-3 text-center">
                  <input type="checkbox" checked={m[l.key].includes(a.key)} disabled={ADM_ONLY.includes(a.key)} onChange={() => toggle(l.key, a.key)} aria-label={`${l.label} · ${a.label}`} data-cell={`${l.key}:${a.key}`} />
                </td>))}
            </tr>))}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">O Adm sempre tem acesso a tudo. “Usuários e níveis de acesso” é exclusivo do Adm. Ao salvar, o acesso de quem já está em cada nível muda na hora (o menu da pessoa se ajusta no próximo clique).</p>
      <Err e={err} />
      {msg && <p className="mt-3 rounded border border-success/40 bg-success/5 p-2 text-sm text-success" role="status">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2">
        {dirty && <button className={`${btn} hover:bg-ink/5`} onClick={() => setM(initial)}>Desfazer alterações</button>}
        <button className={`${btn} h-10 bg-accent px-5 text-accent-ink`} disabled={pending || !dirty} onClick={() => go(() => saveLevelMatrixAction(m), () => setMsg("Níveis de acesso salvos."))} data-save-matrix>{pending ? "Salvando…" : "Salvar níveis de acesso"}</button>
      </div>
    </div>
  );
}
