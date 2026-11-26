"use client";

import { useId } from "react";
import { modifierSelectionError } from "@/lib/modifiers";
import type { MenuItem } from "@/lib/types";

export function ModifierPicker({ item, selected, onChange, money }: {
  item: MenuItem;
  selected: string[];
  onChange: (ids: string[]) => void;
  money: (minor: number) => string;
}) {
  const id = useId();
  const groups = item.modifierGroups ?? [];
  const extras = item.modifiers.filter((option) => !option.groupId);
  const error = modifierSelectionError(groups, item.modifiers, selected);
  const sections = extras.length ? [...groups, { id: "", name: "Optional extras", minChoices: 0, maxChoices: extras.length }] : groups;
  return (
    <div className="space-y-3">
      {sections.map((group) => {
        const options = item.modifiers.filter((option) => (option.groupId ?? "") === group.id);
        const picked = options.filter((option) => selected.includes(option.id));
        const outside = selected.filter((value) => !options.some((option) => option.id === value));
        const single = !!group.id && group.maxChoices === 1;
        return <fieldset key={group.id} className="space-y-2">
          <legend className="font-semibold">{group.name}</legend>
          {group.id && <p className="text-xs text-[var(--ink-soft)]">{group.minChoices === group.maxChoices
            ? `Choose ${group.minChoices} · Required`
            : group.minChoices === 0 ? `Choose up to ${group.maxChoices} · Optional` : `Choose ${group.minChoices} to ${group.maxChoices} · Required`}</p>}
          {single && group.minChoices === 0 && <label className="flex min-h-10 items-center gap-2 px-3 text-sm">
            <input type="radio" name={`${id}-${group.id}`} checked={!picked.length} onChange={() => onChange(outside)} /> None
          </label>}
          {options.map((option) => {
            const checked = selected.includes(option.id);
            return <label key={option.id} className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--rule)] px-3 text-sm">
              <input type={single ? "radio" : "checkbox"} name={single ? `${id}-${group.id}` : undefined}
                checked={checked} disabled={!single && !checked && picked.length >= group.maxChoices}
                onChange={() => {
                  if (single) onChange([...outside, option.id]);
                  else if (checked) onChange(selected.filter((value) => value !== option.id));
                  else onChange([...selected, option.id]);
                }} />
              <span className="flex-1">{option.name}</span>
              {option.priceAdjustmentMinor !== 0 && <span>{option.priceAdjustmentMinor > 0 ? "+" : ""}{money(option.priceAdjustmentMinor)}</span>}
            </label>;
          })}
        </fieldset>;
      })}
      {error && <p aria-live="polite" className="text-xs text-[var(--ink-soft)]">{error}</p>}
    </div>
  );
}
