// クラシック08 独自制限リストに基づくデッキ合法性判定。
//
// 重要: このファイルは public/js/deck-legality.js と1:1で対応させる（ロジックの手動移植）。
// バンドラが無いためブラウザ側は手書きプレーンJSになっている。
// このファイルを変更したら public/js/deck-legality.js も必ず同様に直すこと。

import { RestrictionList } from './restrictions.js'

export interface DeckEntry {
  id: string
  name: string
  count: number
}

export type ViolationType = 'deck-size' | 'banned' | 'restricted' | 'helper-limit' | 'banned-combo'

export interface Violation {
  type: ViolationType
  message: string
}

export interface DeckLegalityResult {
  legal: boolean
  violations: Violation[]
}

const DECK_SIZE = 40

/** 名前ベースでデッキ内の合計枚数を数える（同名カードが複数エントリに分かれることは想定しないが安全のため合算する） */
function countByName(deck: DeckEntry[], name: string): number {
  return deck
    .filter(e => e.name === name)
    .reduce((sum, e) => sum + (e.count || 0), 0)
}

export function checkDeckLegality(deck: DeckEntry[], restrictionList: RestrictionList): DeckLegalityResult {
  const violations: Violation[] = []

  const total = deck.reduce((sum, e) => sum + (e.count || 0), 0)
  if (total !== DECK_SIZE) {
    violations.push({
      type: 'deck-size',
      message: `デッキは${DECK_SIZE}枚である必要がありますが、現在${total}枚です。`,
    })
  }

  for (const entry of restrictionList.banned) {
    if (countByName(deck, entry.name) > 0) {
      violations.push({
        type: 'banned',
        message: `《${entry.name}》は使用禁止カードです。`,
      })
    }
  }

  for (const entry of restrictionList.restricted) {
    const n = countByName(deck, entry.name)
    if (n > 1) {
      violations.push({
        type: 'restricted',
        message: `《${entry.name}》は制限カードのため1枚までですが、現在${n}枚入っています。`,
      })
    }
  }

  const helperNames = restrictionList.helper.map(e => e.name)
  const presentHelperNames = helperNames.filter(name => countByName(deck, name) > 0)
  const helperTotal = presentHelperNames.reduce((sum, name) => sum + countByName(deck, name), 0)
  if (helperTotal > restrictionList.helperPickLimit) {
    const cardList = presentHelperNames.map(n => `《${n}》`).join('')
    violations.push({
      type: 'helper-limit',
      message: `お助けカードは${helperNames.length}種のうち合計${restrictionList.helperPickLimit}枚までです。現在${cardList}の${helperTotal}枚が入っています。`,
    })
  }

  for (const combo of restrictionList.bannedCombos) {
    const namesInCombo = combo.cards.map(c => c.name)
    const allPresent = namesInCombo.every(name => countByName(deck, name) > 0)
    if (allPresent) {
      const cardList = namesInCombo.map(n => `《${n}》`).join('')
      violations.push({
        type: 'banned-combo',
        message: `${cardList}は同一デッキへの同時投入が禁止されている組み合わせです。`,
      })
    }
  }

  return { legal: violations.length === 0, violations }
}
