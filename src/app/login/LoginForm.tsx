"use client";

import { Loader2, Lock } from "lucide-react";
import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="card w-full max-w-xs space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-fg">
          <Lock size={20} aria-hidden />
        </span>
        <div>
          <h1 className="font-semibold">Money Tracker</h1>
          <p className="text-xs text-muted">Enter your PIN to continue</p>
        </div>
      </div>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="pin" className="label">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          required
          className="input text-center text-2xl tracking-[0.4em]"
        />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <button className="btn-primary w-full" disabled={pending}>
        {pending && <Loader2 size={18} className="animate-spin" />} Unlock
      </button>
    </form>
  );
}
