import Link from "next/link";

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-xl bg-[var(--chili)] font-[family-name:var(--font-serif)] text-[var(--ticket)]"
      style={{ width: size, height: size, fontSize: size * 0.36, fontWeight: 700 }}
      aria-hidden
    >
      ONF
    </span>
  );
}

export function BrandLink() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[var(--ink)]">
      <BrandMark />
      <strong className="tracking-tight">OrderNFlow</strong>
    </Link>
  );
}
