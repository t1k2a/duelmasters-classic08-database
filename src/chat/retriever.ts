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
  '天門': ['ヘブンズ・ゲート', '悪魔聖霊バルホルス', '天海の精霊シリウス', '奇跡の精霊ミルザム'],
  'ヘブンズゲート': ['ヘブンズ・ゲート', '悪魔聖霊バルホルス', '天海の精霊シリウス'],
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
  'ブロッカーデッキ': ['ヘブンズ・ゲート', '悪魔聖霊バルホルス', '天海の精霊シリウス', '光器ペトローバ'],
  'ブロッカー主体のデッキ': ['ヘブンズ・ゲート', '悪魔聖霊バルホルス', '天海の精霊シリウス', '光器ペトローバ'],
  'ブロッカー主体': ['ヘブンズ・ゲート', '悪魔聖霊バルホルス', '天海の精霊シリウス'],
};

// src/chat/retriever.ts
import type { Corpus } from './corpus.js'
import type { RetrievalResult, CardData, ChatTurn } from './types.js'
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

export interface PowerFilter {
  target: number
  op: 'gte' | 'lte' | 'eq'
}

export function parsePowerFilter(q: string): PowerFilter | null {
  const gteMatch = q.match(/パワー\s*(\d+)\s*(?:以上|超え|より大きい)/) ?? q.match(/(\d+)\s*以上.*パワー/)
  if (gteMatch && gteMatch[1]) {
    return { target: parseInt(gteMatch[1], 10), op: 'gte' }
  }
  const lteMatch = q.match(/パワー\s*(\d+)\s*(?:以下|未満|より小さい)/) ?? q.match(/(\d+)\s*以下.*パワー/)
  if (lteMatch && lteMatch[1]) {
    return { target: parseInt(lteMatch[1], 10), op: 'lte' }
  }
  const eqMatch = q.match(/パワー\s*(\d+)/)
  if (eqMatch && eqMatch[1]) {
    return { target: parseInt(eqMatch[1], 10), op: 'eq' }
  }
  if (q.includes('高パワー')) {
    return { target: 6000, op: 'gte' }
  }
  return null
}

export function checkPowerFilter(card: CardData, filter: PowerFilter | null): boolean {
  if (!filter) return true
  if (card.power == null) return false
  if (filter.op === 'gte') return card.power >= filter.target
  if (filter.op === 'lte') return card.power <= filter.target
  if (filter.op === 'eq') return card.power === filter.target
  return true
}

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

// 履歴から文脈キーワード（直前のデッキテーマやカード名）を抽出してクエリを補完
function expandQueryFromHistory(question: string, history: ChatTurn[]): string {
  if (!history || history.length === 0) return question
  // 質問文に具体的なテーマ語が薄い（「デッキ」「レシピ」「共有」「教えて」「詳しく」などだけ）の場合に補完発動
  const isContextDependent = /(?:レシピ|リスト|共有|教えて|詳しく|どう組む|他には|回し方|回しかた|使い方|構築)/.test(question)
  if (!isContextDependent) return question

  // 直近の会話（最大3ターン）からキーワードを探す
  const pastTexts = history.slice(-4).map(h => h.content).reverse()
  const candidateKeywords: string[] = []

  for (const text of pastTexts) {
    // 俗称辞書にあるキー
    for (const k of Object.keys(ALIAS_MAP)) {
      if (text.includes(k) && !candidateKeywords.includes(k)) {
        candidateKeywords.push(k)
      }
    }
    // 役割キーワード（ブロッカー、速攻等）
    for (const r of ['ブロッカー', '速攻', '天門', 'コントロール', 'ガーディアン', 'ナイト']) {
      if (text.includes(r) && !candidateKeywords.includes(r)) {
        candidateKeywords.push(r)
      }
    }
  }

  if (candidateKeywords.length > 0) {
    return `${question} ${candidateKeywords.slice(0, 3).join(' ')}`
  }
  return question
}

export function retrieve(corpus: Corpus, question: string, history: ChatTurn[] = []): RetrievalResult {
  const expandedWithHistory = expandQueryFromHistory(question, history)
  const baseQn = normalizeKana(expandedWithHistory)
  let expandedQn = baseQn
  for (const [alias, targets] of Object.entries(ALIAS_MAP)) {
    const normAlias = normalizeKana(alias)
    if (baseQn.includes(normAlias)) {
      expandedQn += ' ' + targets.map(t => normalizeKana(t)).join(' ')
    }
  }
  const qn = expandedQn

  const powerFilter = parsePowerFilter(question)
  const hasPowerFilter = powerFilter != null

  // (a) カード名一致
  const named: CardData[] = []
  for (const card of corpus.cards) {
    const nn = normalizeKana(card.name)
    if (nn.length >= 2 && qn.includes(nn)) {
      // パワーフィルタがある場合は厳格に合致チェック
      if (hasPowerFilter && !checkPowerFilter(card, powerFilter)) continue
      named.push(card)
      if (named.length >= 8) break
    }
  }

  // (b) 「属性（文明・コスト・タイプ・パワー）＋役割」タグ検索リトリーバー
  const targetCivs = new Set<string>()
  for (const c of CIVS) {
    if (question.includes(c)) targetCivs.add(c)
  }
  for (const [colorName, civs] of Object.entries(CIV_COLOR_MAP)) {
    if (question.includes(colorName)) {
      for (const c of civs) targetCivs.add(c)
    }
  }

  const activeRoles = ROLE_PATTERNS.filter(r => question.includes(r.name) || expandedWithHistory.includes(r.name))
  const hasCostFilter = /(?:軽量|低コスト|序盤|中コスト|中盤|大型|高コスト|フィニッシャー|切り札|\d+マナ|\d+コスト)/.test(question)
  const hasTypeFilter = /(?:呪文|進化|クロスギア|クリーチャー)/.test(question)

  const aux: CardData[] = []
  if ((targetCivs.size > 0 || activeRoles.length > 0 || hasCostFilter || hasTypeFilter || hasPowerFilter) && named.length < 8) {
    const scored: { card: CardData; score: number }[] = []
    for (const card of corpus.cards) {
      if (named.includes(card)) continue

      // パワー条件がある場合は、合致しないカードは絶対に除外！
      if (hasPowerFilter) {
        if (!checkPowerFilter(card, powerFilter)) continue
      }

      let score = 0
      if (hasPowerFilter) {
        score += 4
      }

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
        if (roleMatches === 0 && (targetCivs.size === 0 || !hasCostFilter) && !hasPowerFilter) continue
        score += roleMatches * 3
      }

      if (score > 0) {
        scored.push({ card, score })
      }
    }

    // パワーフィルタがある場合はパワーの高い順（またはスコア順）にソート
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (hasPowerFilter && a.card.power != null && b.card.power != null) {
        return b.card.power - a.card.power
      }
      return 0
    })

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
      if (cd) {
        // パワーフィルタがある場合は合致チェック
        if (hasPowerFilter && !checkPowerFilter(cd, powerFilter)) continue
        cards.push(cd)
        seen.add(cd.id)
      }
    }
    if (cards.length >= 8) break
  }

  // (c) 関連レシピ（質問キーワードとのマッチング＆検証済み優先）
  const idSet = new Set(cards.map(c => c.id))
  const isDeckQuery = /(?:デッキ|でっき|構築|レシピ|主体)/.test(question) || /(?:デッキ|でっき|構築|レシピ)/.test(expandedWithHistory)

  const scoredRecipes: { recipe: any; score: number }[] = []
  for (const r of corpus.recipes) {
    if (!Array.isArray(r.cards)) continue
    let score = 0
    let nameMatched = false
    // 抽出カードが含まれる数
    const matchedCount = r.cards.filter(rc => idSet.has(rc.id)).length
    score += matchedCount * 2

    // レシピ名・アーキタイプが質問キーワードにヒットする場合の大幅加点
    const rName = normalizeKana(r.name ?? '')
    const rArch = normalizeKana(typeof r.archetype === 'string' ? r.archetype : '')
    if (qn.includes('てんもん') || qn.includes('へぶんず') || qn.includes('ぶろっかー')) {
      if (rName.includes('天門') || rName.includes('へぶんず') || rArch.includes('へぶんずげーと') || rName.includes('ぶろっかー')) {
        score += 15
        nameMatched = true
      }
    }
    if (isDeckQuery) {
      for (const token of [rName, rArch]) {
        if (token && mutualIncludes(qn, token)) {
          score += 8
          nameMatched = true
        }
      }
    }

    if (matchedCount > 0 || nameMatched) {
      if (r.validated) score += 5
      scoredRecipes.push({ recipe: r, score })
    }
  }

  scoredRecipes.sort((a, b) => b.score - a.score)
  const recipes = scoredRecipes.slice(0, 3).map(s => s.recipe)

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