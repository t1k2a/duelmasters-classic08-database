// 定番略称・俗称から正式名称・キーワードへのマッピング（knowledge/card-aliases.md と同期）
export const ALIAS_MAP: Record<string, string[]> = {
  // --- 象徴的切り札・コントロール ---
  'ボルコン': ['ボルメテウス・ホワイト・ドラゴン', 'ボルメテウス・コントロール'],
  'ボルメテウス': ['ボルメテウス・ホワイト・ドラゴン'],
  'ボルメ': ['ボルメテウス・ホワイト・ドラゴン'],
  '武者': ['ボルメテウス・武者・ドラゴン'],
  '紫電': ['ボルバルザーク・紫電・ドラゴン'],
  'エタソ': ['英知と追撃の宝剣'],
  '宝剣': ['英知と追撃の宝剣'],
  'PG': ['不滅の精霊パーフェクト・ギャラクシー'],
  'パーフェクトギャラクシー': ['不滅の精霊パーフェクト・ギャラクシー'],
  'ギャラクシー': ['不滅の精霊パーフェクト・ギャラクシー'],
  'マルコ': ['エンペラー・マルコ'],
  'オルゼキア': ['魔刻の斬将オルゼキア'],
  'キング': ['聖鎧亜キング・アルカディアス'],
  'クイーン': ['聖鎧亜クイーン・アルカディアス'],
  '王アルカ': ['聖鎧亜キング・アルカディアス'],
  'アルファディオス': ['聖霊王アルファディオス'],
  'アルファ': ['聖霊王アルファディオス'],
  'アルカディアス': ['聖霊王アルカディアス'],
  'ドルバロム': ['悪魔神ドルバロム'],
  'バロム': ['悪魔神バロム'],
  'ロマノフ': ['邪眼皇ロマノフI世', 'インフェルノ・サイン'],
  'バジュラ': ['超竜バジュラ'],
  'バイケン': ['斬隠蒼頭龍バイケン'],
  'ハヤブサマル': ['光牙忍ハヤブサマル'],
  'ハヤブサ': ['光牙忍ハヤブサマル'],
  'ハンゾウ': ['威牙の幻ハンゾウ'],
  'ヘヴィメタル': ['龍神ヘヴィ', '龍神メタル'],
  'ヘヴィ': ['龍神ヘヴィ'],
  'メタル': ['龍神メタル'],
  'ゲキメツ': ['竜極神ゲキ', '竜極神メツ'],
  'ゲキ': ['竜極神ゲキ'],
  'メツ': ['竜極神メツ'],

  // --- 定番ドロー・リソース・サポート ---
  'ハルカス': ['アクア・ハルカス'],
  '青銅': ['青銅の鎧'],
  'デモハン': ['デーモン・ハンド'],
  'スクラッパー': ['地獄スクラッパー'],
  'サーファー': ['アクア・サーファー'],
  'サイバーブレイン': ['サイバー・ブレイン'],
  'サイブレ': ['サイバー・ブレイン'],
  'エナジーライト': ['エナジー・ライト'],
  'エナライ': ['エナジー・ライト'],
  'アクアン': ['アクアン'],
  '母なる': ['母なる大地'],
  'ナスオ': ['ダンディ・ナスオ'],
  'クルト': ['予言者クルト'],
  'ロスト': ['ロスト・ソウル'],
  'ソウルアド': ['ソウル・アドバンテージ'],
  'ソウルアドバンテージ': ['ソウル・アドバンテージ'],
  'ペト': ['光器ペトローバ'],
  'ペトローバ': ['光器ペトローバ'],
  'パクリオ': ['パクリオ'],
  '解体': ['解体人形ジェニー'],
  'ジェニー': ['解体人形ジェニー'],
  'トリプルマウス': ['腐敗無頼トリプルマウス'],
  'ミストリエス': ['雷鳴の守護者ミスト・リエス'],
  'ミスト': ['雷鳴の守護者ミスト・リエス'],
  'サイン': ['インフェルノ・サイン'],
  'インフェルノサイン': ['インフェルノ・サイン'],
  'インフェルノゲート': ['インフェルノ・ゲート'],
  '天門': ['ヘブンズ・ゲート', '悪魔聖霊バルホルス', '天海の精霊シリウス'],
  'ヘブンズゲート': ['ヘブンズ・ゲート'],
  'バルホルス': ['悪魔聖霊バルホルス'],
  'シリウス': ['天海の精霊シリウス'],
  'ラベイル': ['閃光の求道者ラ・ベイル'],
  'ランサー': ['クリスタル・ランサー'],
  'パラディン': ['クリスタル・パラディン'],
  'ハックル': ['密林の総督ハックル・キリンソーヤ'],
  'キリンソーヤ': ['密林の総督ハックル・キリンソーヤ'],
  'ジャック': ['超竜騎神ボルガウルジャック'],

  // --- アーキタイプ・カラー俗称 ---
  '赤緑速攻': ['赤緑速攻', '凶戦士ブレイズ・クロー', '解体屋ピーカプ'],
  '青単速攻': ['青単速攻', 'クリスタル・ランサー', 'マリン・フラワー'],
  '黒緑速攻': ['黒緑速攻', '孤独の影ロンリー・ウォーカー', 'スナイプ・モスキート'],
  'マルコビート': ['エンペラー・マルコ', 'アクア・ハルカス'],
  'ナイト': ['魔光帝フェルナンドVII世', '魔弾グローリー・ゲート'],
  'ナイトコントロール': ['魔光帝フェルナンドVII世', '魔弾グローリー・ゲート'],
  '連ドラ': ['インフィニティ・ドラゴン', '超竜バジュラ', 'フレミングジェット・ドラゴン'],
  'シノビドルゲーザ': ['剛撃戦攻ドルゲーザ', '光牙忍ハヤブサマル', '斬隠蒼頭龍バイケン'],
  'ドルゲーザ': ['剛撃戦攻ドルゲーザ'],
  'ランデス': ['英知と追撃の宝剣', 'マナ・クライシス'],
  'ランデスコントロール': ['英知と追撃の宝剣', 'マナ・クライシス', '焦土と開拓の天変'],
  'ドロマー': ['ドロマー', 'ヘブンズ・ゲート', 'デーモン・ハンド'],
  'ドロマー天門': ['ヘブンズ・ゲート', '悪魔聖霊バルホルス', 'デーモン・ハンド'],
  'クローシス': ['ボルメテウス・ホワイト・ドラゴン', 'デーモン・ハンド', '地獄スクラッパー'],
  'ネクラ': ['聖鎧亜キング・アルカディアス', '魔刻の斬将オルゼキア', '母なる大地'],
  'ネクラコントロール': ['聖鎧亜キング・アルカディアス', '魔刻の斬将オルゼキア', '母なる大地'],
  'ネクラキング': ['聖鎧亜キング・アルカディアス', '魔刻の斬将オルゼキア'],
  'サバキ': ['魂と記憶の盾', '不滅の精霊パーフェクト・ギャラクシー'],
  'サバキストライク': ['魂と記憶の盾', '不滅の精霊パーフェクト・ギャラクシー'],
};

// src/chat/retriever.ts
import type { Corpus } from './corpus.js'
import type { RetrievalResult, CardData } from './types.js'
import { normalizeKana } from './normalize.js'

const CIVS = ['光', '水', '闇', '火', '自然']

// 文明俗称・カラー名マップ
const CIV_COLOR_MAP: Record<string, string[]> = {
  '白': ['光'], '青': ['水'], '黒': ['闇'], '赤': ['火'], '緑': ['自然'],
  'ドロマー': ['光', '水', '闇'],
  'クローシス': ['水', '闇', '火'],
  'ネクラ': ['光', '闇', '自然'],
  'デアリ': ['闇', '火', '自然'],
  'リース': ['光', '火', '自然'],
  'アナカラー': ['水', '闇', '自然'],
  'トリーヴァ': ['光', '水', '自然'],
}

// 役割・効果キーワード判定パターン
const ROLE_PATTERNS: { name: string; test: (card: CardData) => boolean }[] = [
  { name: 'ドロー', test: c => /(?:カードを.*枚引|ドロー|手札に加える)/.test(c.text ?? '') },
  { name: '手札補充', test: c => /(?:カードを.*枚引|ドロー|手札に加える)/.test(c.text ?? '') },
  { name: '除去', test: c => /(?:破壊する|墓地に置く|バトルゾーンから)/.test(c.text ?? '') },
  { name: '破壊', test: c => /(?:破壊する)/.test(c.text ?? '') },
  { name: 'マナ加速', test: c => /(?:マナゾーンに置く|山札の上から.*マナ)/.test(c.text ?? '') },
  { name: 'マナブースト', test: c => /(?:マナゾーンに置く|山札の上から.*マナ)/.test(c.text ?? '') },
  { name: 'ブースト', test: c => /(?:マナゾーンに置く|山札の上から.*マナ)/.test(c.text ?? '') },
  { name: 'トリガー', test: c => /(?:シールド・トリガー|S・トリガー)/.test(c.text ?? '') },
  { name: 'S・トリガー', test: c => /(?:シールド・トリガー|S・トリガー)/.test(c.text ?? '') },
  { name: 'ハンデス', test: c => /(?:手札を.*捨て|手札.*選んで捨て)/.test(c.text ?? '') },
  { name: '手札破壊', test: c => /(?:手札を.*捨て|手札.*選んで捨て)/.test(c.text ?? '') },
  { name: 'ブロッカー', test: c => (c.text ?? '').includes('ブロッカー') },
  { name: 'バウンス', test: c => /(?:手札に戻す)/.test(c.text ?? '') },
  { name: '踏み倒し', test: c => /(?:コストを支払わずに|バトルゾーンに出す)/.test(c.text ?? '') },
  { name: 'リアニメイト', test: c => /(?:墓地から.*バトルゾーンに出す|墓地から.*クリーチャー)/.test(c.text ?? '') },
  { name: 'スピードアタッカー', test: c => (c.text ?? '').includes('スピードアタッカー') },
  { name: 'SA', test: c => (c.text ?? '').includes('スピードアタッカー') },
  { name: 'シノビ', test: c => (c.text ?? '').includes('ニンジャ・ストライク') },
  { name: 'ニンジャ', test: c => (c.text ?? '').includes('ニンジャ・ストライク') },
]

function checkCostFilter(card: CardData, q: string): boolean {
  if (/(?:軽量|低コスト|序盤)/.test(q)) return card.cost != null && card.cost <= 3
  if (/(?:中コスト|中盤)/.test(q)) return card.cost != null && card.cost >= 4 && card.cost <= 6
  if (/(?:大型|高コスト|フィニッシャー|切り札)/.test(q)) return card.cost != null && card.cost >= 7
  const manaMatch = q.match(/(\d+)(?:マナ|コスト)/)
  if (manaMatch && manaMatch[1]) {
    const target = parseInt(manaMatch[1], 10)
    return card.cost === target
  }
  return true
}

function checkTypeFilter(card: CardData, q: string): boolean {
  if (q.includes('呪文')) return card.cardType === '呪文'
  if (q.includes('進化')) return card.cardType === '進化クリーチャー'
  if (q.includes('クロスギア')) return card.cardType === 'クロスギア'
  if (q.includes('クリーチャー') && !q.includes('進化')) return card.cardType.includes('クリーチャー')
  return true
}

function headTerm(s: string): string {
  return s.split(/[（(]/)[0]?.trim() ?? s
}

export function mutualIncludes(an: string, bn: string, min = 2): boolean {
  if (an.length < min || bn.length < min) return false
  return an.includes(bn) || bn.includes(an)
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

function bigramCoverage(qn: string, tn: string): number {
  if (qn.length < 2 || tn.length < 3) return 0
  const qb = bigrams(qn), tb = bigrams(tn)
  let inter = 0
  for (const g of tb) if (qb.has(g)) inter++
  return inter / tb.size
}

export function retrieve(corpus: Corpus, question: string): RetrievalResult {
  const baseQn = normalizeKana(question)
  let expandedQn = baseQn
  for (const [alias, targets] of Object.entries(ALIAS_MAP)) {
    const normAlias = normalizeKana(alias)
    if (baseQn.includes(normAlias)) {
      expandedQn += ' ' + targets.map(t => normalizeKana(t)).join(' ')
    }
  }
  const qn = expandedQn

  // (a) カード名一致
  const named: CardData[] = []
  for (const card of corpus.cards) {
    const nn = normalizeKana(card.name)
    if (nn.length >= 2 && qn.includes(nn)) {
      named.push(card)
      if (named.length >= 8) break
    }
  }

  // (b) 「属性（文明・コスト・タイプ）＋役割」タグ検索リトリーバー
  const targetCivs = new Set<string>()
  for (const c of CIVS) {
    if (question.includes(c)) targetCivs.add(c)
  }
  for (const [colorName, civs] of Object.entries(CIV_COLOR_MAP)) {
    if (question.includes(colorName)) {
      for (const c of civs) targetCivs.add(c)
    }
  }

  const activeRoles = ROLE_PATTERNS.filter(r => question.includes(r.name))
  const hasCostFilter = /(?:軽量|低コスト|序盤|中コスト|中盤|大型|高コスト|フィニッシャー|切り札|\d+マナ|\d+コスト)/.test(question)
  const hasTypeFilter = /(?:呪文|進化|クロスギア|クリーチャー)/.test(question)

  const aux: CardData[] = []
  if ((targetCivs.size > 0 || activeRoles.length > 0 || hasCostFilter || hasTypeFilter) && named.length < 8) {
    const scored: { card: CardData; score: number }[] = []
    for (const card of corpus.cards) {
      if (named.includes(card)) continue

      let score = 0
      if (targetCivs.size > 0) {
        const matchesCiv = card.civilizations.some(c => targetCivs.has(c))
        if (!matchesCiv) continue
        score += 2
      }

      if (hasCostFilter) {
        if (!checkCostFilter(card, question)) continue
        score += 2
      }

      if (hasTypeFilter) {
        if (!checkTypeFilter(card, question)) continue
        score += 2
      }

      if (activeRoles.length > 0) {
        let roleMatches = 0
        for (const role of activeRoles) {
          if (role.test(card)) roleMatches++
        }
        if (roleMatches === 0 && (targetCivs.size === 0 || !hasCostFilter)) continue
        score += roleMatches * 3
      }

      if (score > 0) {
        scored.push({ card, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    for (const item of scored) {
      aux.push(item.card)
      if (named.length + aux.length >= 8) break
    }
  }

  // (meta) アーキタイプ名・タグ・主要語と質問の相互部分一致（normalizeKana経由）
  const metaHits: { json: string; cardRefs: { id: string }[] }[] = []
  for (const m of corpus.meta) {
    try {
      const o = JSON.parse(m)
      if (!o?.name) continue
      const candidates = [
        o.name,
        headTerm(o.name),
        ...(Array.isArray(o.aliases) ? o.aliases : []),
        ...(Array.isArray(o.tags) ? o.tags : []),
      ]
      const matched = candidates.some(t => mutualIncludes(qn, normalizeKana(String(t))))
      if (matched) metaHits.push({ json: m, cardRefs: Array.isArray(o.cards) ? o.cards : [] })
    } catch { /* 不正JSONは無視 */ }
  }
  const meta = metaHits.slice(0, 2).map(h => h.json)

  // (S1) ヒットしたmetaのキーカードを cards に昇格（重複除去・上限8）
  const cards = [...named, ...aux]
  const seen = new Set(cards.map(c => c.id))
  for (const h of metaHits) {
    for (const ref of h.cardRefs) {
      if (cards.length >= 8) break
      if (!ref?.id || seen.has(ref.id)) continue
      const cd = corpus.cardById.get(ref.id)
      if (cd) { cards.push(cd); seen.add(cd.id) }
    }
    if (cards.length >= 8) break
  }

  // (c) 関連レシピ
  const idSet = new Set(cards.map(c => c.id))
  const recipes = corpus.recipes
    .filter(r => Array.isArray(r.cards) && r.cards.some(rc => idSet.has(rc.id)))
    .sort((a, b) => Number(b.validated) - Number(a.validated))
    .slice(0, 3)

  // (d) knowledge: タイトル全体／タイトル先頭の主要語と質問の相互部分一致（2文字以上）
  const knowledge = corpus.knowledge
    .filter(k => {
      const tn = normalizeKana(k.title)
      if (mutualIncludes(qn, tn)) return true
      const head = k.title.match(/^[一-龠々]{2,}/)?.[0]
      if (head && qn.includes(normalizeKana(head))) return true
      return bigramCoverage(qn, tn) >= 0.5
    })
    .slice(0, 3)
    .map(k => `${k.title}: ${k.body}`)

  return { cards, recipes, meta, knowledge }
}
