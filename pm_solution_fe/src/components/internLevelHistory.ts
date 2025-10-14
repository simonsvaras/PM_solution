export type LevelHistoryDraft = {
  levelId: number | null;
  validFrom: string;
  validTo: string | null;
};

type NormalizeOptions = {
  requireOpenLevel?: boolean;
};

export function normalizeLevelHistoryDraft(
  entries: LevelHistoryDraft[],
  { requireOpenLevel = true }: NormalizeOptions = {},
): { error: string | null; sorted: LevelHistoryDraft[] } {
  if (!entries || entries.length === 0) {
    return { error: 'Přidejte alespoň jednu úroveň.', sorted: [] };
  }
  const cleaned = entries.map(entry => ({
    levelId: entry.levelId,
    validFrom: entry.validFrom ? entry.validFrom.trim() : '',
    validTo: entry.validTo && entry.validTo.trim() !== '' ? entry.validTo.trim() : null,
  }));
  for (const item of cleaned) {
    if (item.levelId === null) {
      return { error: 'Vyberte úroveň.', sorted: [] };
    }
    if (!item.validFrom) {
      return { error: 'Datum od je povinné.', sorted: [] };
    }
    if (item.validTo && item.validTo < item.validFrom) {
      return { error: 'Datum do nesmí být dříve než datum od.', sorted: [] };
    }
  }
  const sorted = cleaned.slice().sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  let openIndex = -1;
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (!current.validFrom) {
      return { error: 'Datum od je povinné.', sorted: [] };
    }
    if (current.validTo === null) {
      if (openIndex !== -1) {
        return { error: 'Pouze jedna úroveň může být aktuální.', sorted: [] };
      }
      openIndex = i;
    }
    if (i > 0) {
      const previous = sorted[i - 1];
      if (previous.validTo === null) {
        return { error: 'Historie obsahuje překrývající se období.', sorted: [] };
      }
      if (previous.validTo >= current.validFrom) {
        return { error: 'Historie obsahuje překrývající se období.', sorted: [] };
      }
    }
  }
  if (requireOpenLevel) {
    if (openIndex === -1) {
      return { error: 'Jedna úroveň musí být aktuálně otevřená.', sorted: [] };
    }
    if (openIndex !== sorted.length - 1) {
      return { error: 'Aktuální úroveň musí být poslední v pořadí.', sorted: [] };
    }
  } else if (openIndex !== -1 && openIndex !== sorted.length - 1) {
    return { error: 'Aktuální úroveň musí být poslední v pořadí.', sorted: [] };
  }
  return { error: null, sorted };
}
