/** How a character looks: which model, plus colour changes to its materials (by material name, sRGB). */
export interface Look {
  assetId: string
  tint?: Record<string, number>
}

/**
 * The five representatives each get a different model so they're easy to tell
 * apart in the park and in their portraits. Bob's hair is greyed (the pack has
 * no older character).
 */
export const REPRESENTATIVE_LOOKS: Record<string, Look> = {
  enoch: { assetId: 'Person_Worker_Yellow' },
  adam: { assetId: 'Person_Basketball_Blue' },
  bob: { assetId: 'Person_Man_Blue', tint: { Hair: 0xd9d9d9 } },
  colgne: { assetId: 'Person_Woman_Pink' },
  dylan: { assetId: 'Person_Basketball_Orange' },
}

/** Soft background colour behind each portrait. */
export const PORTRAIT_BACKGROUND: Record<string, string> = {
  enoch: '#d6efc4',
  adam: '#cfe6f7',
  bob: '#f3e1c7',
  colgne: '#f9d3dc',
  dylan: '#ffe0b8',
}

export const lookKey = (l: Look) => `${l.assetId}|${Object.entries(l.tint ?? {}).map(([k, v]) => `${k}:${v.toString(16)}`).join(',')}`
