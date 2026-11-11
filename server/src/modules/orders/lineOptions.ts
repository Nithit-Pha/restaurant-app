// Price one order line with its chosen options, and check the choices against
// the item's option groups (required, at most N, available). Pure, so it is
// unit-tested; the server never trusts a price sent by the client.

export interface OptionModifier {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface OptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: OptionModifier[];
}

export interface PricedOption {
  modifierId: string;
  groupName: string;
  name: string;
  priceDelta: number;
  position: number;
}

const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `groups` must be in display order (and their modifiers too); the chosen
 * options come back in that order whatever order the client sent them in.
 */
export function priceLine(
  item: { name: string; sellingPrice: number; modifierGroups: OptionGroup[] },
  selectedIds: string[],
): { unitPrice: number; options: PricedOption[] } {
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length) throw badRequest(`An option was chosen twice for ${item.name}.`);

  const options: PricedOption[] = [];
  let found = 0;
  for (const group of item.modifierGroups) {
    const chosen = group.modifiers.filter((m) => selected.has(m.id));
    found += chosen.length;
    if (chosen.some((m) => !m.isAvailable)) {
      throw badRequest(`${chosen.find((m) => !m.isAvailable)!.name} is not available right now (${item.name}).`);
    }
    if (chosen.length < group.minSelect) {
      throw badRequest(group.minSelect === 1
        ? `Please choose ${group.name} for ${item.name}.`
        : `Please choose at least ${group.minSelect} for ${group.name} (${item.name}).`);
    }
    if (chosen.length > group.maxSelect) {
      throw badRequest(`Choose at most ${group.maxSelect} for ${group.name} (${item.name}).`);
    }
    for (const m of chosen) {
      options.push({ modifierId: m.id, groupName: group.name, name: m.name, priceDelta: m.priceDelta, position: options.length });
    }
  }
  if (found !== selected.size) throw badRequest(`One or more options do not belong to ${item.name}.`);

  const unitPrice = round2(item.sellingPrice + options.reduce((s, o) => s + o.priceDelta, 0));
  if (unitPrice < 0) throw badRequest(`The options make ${item.name} cost less than nothing.`);
  return { unitPrice, options };
}
