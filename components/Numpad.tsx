"use client";

export default function Numpad({ onDigit, onBackspace }: { onDigit: (d: string) => void; onBackspace: () => void }) {
  const key = "rounded-lg border border-neutral-300 py-4 text-xl active:bg-neutral-200 dark:border-neutral-700 dark:active:bg-neutral-800";
  return (
    <div className="mx-auto mt-4 hidden w-full max-w-xs grid-cols-3 gap-2 [@media(pointer:coarse)]:grid">
      {"123456789".split("").map((d) => (
        <button key={d} type="button" className={key} onClick={() => onDigit(d)}>{d}</button>
      ))}
      <span />
      <button type="button" className={key} onClick={() => onDigit("0")}>0</button>
      <button type="button" className={key} aria-label="Backspace" onClick={onBackspace}>⌫</button>
    </div>
  );
}
