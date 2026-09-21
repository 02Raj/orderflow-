import { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  copy,
  actions,
}: {
  kicker?: string;
  title: string;
  copy?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--chili)]">
            {kicker}
          </p>
        ) : null}
        <h1 className="display mt-1 text-4xl leading-none md:text-5xl">{title}</h1>
        {copy ? <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ink-soft)]">{copy}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  copy,
  action,
  steps,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
  steps?: string[];
}) {
  return (
    <div className="card mt-8 max-w-xl p-8">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#f3d0c8] text-xl">⌀</div>
      <h2 className="display text-2xl">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{copy}</p>
      {steps?.length ? (
        <ol className="mt-5 space-y-2 text-sm">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--paper-2)] text-xs font-semibold">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mt-3 h-7 w-40" />
          <div className="skeleton mt-5 h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full ${i + 1 === step ? "w-6 bg-[var(--chili)]" : "w-1.5 bg-[var(--rule)]"}`}
        />
      ))}
    </div>
  );
}
