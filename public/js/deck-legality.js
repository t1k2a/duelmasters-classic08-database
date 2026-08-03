// クラシック08 独自制限リストに基づくデッキ合法性判定（ブラウザ向けプレーンJS版）。
//
// 重要: このファイルは src/verify/deck-legality.ts と1:1で対応させる（手動移植）。
// バンドラが無いため TS からの自動生成はできない。
// このファイルを変更したら src/verify/deck-legality.ts も必ず同様に直すこと。

const DECK_SIZE = 40;

/** 名前ベースでデッキ内の合計枚数を数える（同名カードが複数エントリに分かれることは想定しないが安全のため合算する） */
function countByName(deck, name) {
  return deck
    .filter(e => e.name === name)
    .reduce((sum, e) => sum + (e.count || 0), 0);
}

// deck: {id, name, count}[]
// restrictionList: public/data/classic08-restrictions.json の内容（banned/restricted/helper/helperPickLimit/bannedCombos）
function checkDeckLegality(deck, restrictionList) {
  const violations = [];

  const total = deck.reduce((sum, e) => sum + (e.count || 0), 0);
  if (total !== DECK_SIZE) {
    violations.push({
      type: 'deck-size',
      message: `デッキは${DECK_SIZE}枚である必要がありますが、現在${total}枚です。`,
    });
  }

  for (const entry of restrictionList.banned) {
    if (countByName(deck, entry.name) > 0) {
      violations.push({
        type: 'banned',
        message: `《${entry.name}》は使用禁止カードです。`,
      });
    }
  }

  for (const entry of restrictionList.restricted) {
    const n = countByName(deck, entry.name);
    if (n > 1) {
      violations.push({
        type: 'restricted',
        message: `《${entry.name}》は制限カードのため1枚までですが、現在${n}枚入っています。`,
      });
    }
  }

  const helperNames = restrictionList.helper.map(e => e.name);
  const presentHelperNames = helperNames.filter(name => countByName(deck, name) > 0);
  const helperTotal = presentHelperNames.reduce((sum, name) => sum + countByName(deck, name), 0);
  if (helperTotal > restrictionList.helperPickLimit) {
    const cardList = presentHelperNames.map(n => `《${n}》`).join('');
    violations.push({
      type: 'helper-limit',
      message: `お助けカードは${helperNames.length}種のうち合計${restrictionList.helperPickLimit}枚までです。現在${cardList}の${helperTotal}枚が入っています。`,
    });
  }

  for (const combo of restrictionList.bannedCombos) {
    const namesInCombo = combo.cards.map(c => c.name);
    const allPresent = namesInCombo.every(name => countByName(deck, name) > 0);
    if (allPresent) {
      const cardList = namesInCombo.map(n => `《${n}》`).join('');
      violations.push({
        type: 'banned-combo',
        message: `${cardList}は同一デッキへの同時投入が禁止されている組み合わせです。`,
      });
    }
  }

  return { legal: violations.length === 0, violations };
}
