// src/chat/normalize.ts
export function normalizeKana(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[・･\sー\-—–]/g, '') // 中黒・長音・空白・ハイフン除去
    .toLowerCase()
}
