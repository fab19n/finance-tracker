"use client";

import { Loader2, Wallet } from "lucide-react";
import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

/**
 * The PIN screen: one masked field of any length (a real password input, so a keyboard and a password manager both work),
 * and an Unlock button. The server's two answers are shown as it words them: "That PIN isn't right." and, after five wrong
 * tries, "Too many wrong attempts. Wait a minute and try again." There is no biometric, keypad or greeting by design.
 * A phone shows it bare on the page; from md up it sits in a card.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="w-full max-w-xs space-y-4 text-center md:card md:max-w-sm md:space-y-5 md:!p-8">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg" aria-hidden>
          <Wallet size={26} />
        </span>
        <h1 className="text-lg font-extrabold tracking-tight">Money Tracker</h1>
      </div>

      {state.error && (
        <p id="pin-error" role="alert" className="banner banner-danger justify-center font-semibold">
          {state.error}
        </p>
      )}

      <p className="text-sm text-muted">Enter your PIN to continue</p>
      <input type="hidden" name="next" value={next} />
      <div className="text-left">
        <label htmlFor="pin" className="label text-center">
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
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "pin-error" : undefined}
          className={`input text-center text-2xl tracking-[0.4em] ${state.error ? "!border-danger" : ""}`}
        />
      </div>
      <button className="btn-primary w-full" disabled={pending}>
        {pending && <Loader2 size={18} className="animate-spin" />} Unlock
      </button>
    </form>
  );
}
