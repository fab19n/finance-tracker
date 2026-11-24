import type { ComponentProps } from "react";

/**
 * The design's on/off switch: a real checkbox (role="switch", so a form posts it like any checkbox and a screen reader says
 * "on" / "off") drawn as a 48 x 28 track with a thumb (the `tgl` class in globals.css). The label wraps it, which makes the
 * whole row at least 44 px tall to tap. Use it for single on/off settings; plain checkboxes stay in tables and lists.
 *
 *   <Toggle name="active" defaultChecked label="Active" hint="Counts in the plan" />
 */
export function Toggle({
  label,
  hint,
  className = "",
  ...input
}: Omit<ComponentProps<"input">, "type" | "role" | "className"> & { label: string; hint?: string; className?: string }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 ${className}`}>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold">{label}</span>
        {hint && <span className="sub block">{hint}</span>}
      </span>
      <input {...input} type="checkbox" role="switch" className="peer sr-only" />
      <span className="tgl" aria-hidden />
    </label>
  );
}
