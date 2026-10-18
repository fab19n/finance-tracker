"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

/**
 * The search box on Activity. The server does the searching, over the WHOLE selected period (the list on screen is only a
 * page of it), so typing doesn't filter what is visible: it asks the server again, after a short pause or on Enter, by
 * replacing the URL. `others` are the other filters to keep (month, type, category, account); the page number resets.
 *
 * It is also a plain GET form, so without JavaScript Enter still searches.
 */
export function ActivitySearch({ q, others }: { q: string; others: Record<string, string> }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function go(text: string) {
    const params = new URLSearchParams(others);
    if (text.trim()) params.set("q", text.trim());
    const query = params.toString();
    start(() => router.replace(`/transactions${query ? `?${query}` : ""}`));
  }

  return (
    <form
      role="search"
      action="/transactions"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(value);
      }}
      className="relative"
    >
      {Object.entries(others).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const text = e.target.value;
          timer.current = setTimeout(() => go(text), 450);
        }}
        placeholder="Search item, note, category"
        aria-label="Search entries"
        aria-busy={pending}
        autoComplete="off"
        className="input !rounded-full !bg-card !pl-10"
      />
    </form>
  );
}
