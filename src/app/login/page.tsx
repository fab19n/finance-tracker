import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

type Params = Promise<Record<string, string | string[] | undefined>>;

/** The static shell (centering + skeleton) prerenders; only the redirect target is read at request time. */
export default function LoginPage({ searchParams }: { searchParams: Params }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Suspense fallback={<div className="card h-64 w-full max-w-xs animate-pulse" aria-busy="true" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: Params }) {
  const raw = (await searchParams).next;
  return <LoginForm next={(Array.isArray(raw) ? raw[0] : raw) ?? "/"} />;
}
