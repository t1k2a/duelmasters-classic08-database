// かな表記をレシピ名照合向けに正規化する。
export function normalizeKana(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[・･\sー\-—–]/g, '')
    .toLowerCase()
}
