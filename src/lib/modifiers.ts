import type { MenuModifier, ModifierGroup } from './types';

export function modifierSelectionError(
  groups: ModifierGroup[],
  modifiers: Pick<MenuModifier, 'id' | 'groupId'>[],
  ids: string[],
) {
  for (const group of groups) {
    const count = modifiers.filter((option) => option.groupId === group.id && ids.includes(option.id)).length;
    if (count < group.minChoices) return `${group.name}: choose at least ${group.minChoices}.`;
    if (count > group.maxChoices) return `${group.name}: choose up to ${group.maxChoices}.`;
  }
  return null;
}
