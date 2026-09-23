# Organic User Growth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, superpowers:subagent-driven-development, or superpowers:agent-teams-development to implement this plan. Ask the user which approach they prefer.

**Goal:** 外部の大会主催者・発信者との個別連携を使わず、検索コンテンツ、サイト内回遊、デッキ共有によって月間アクティブユーザー100人を目指せる計測可能な成長基盤を構築する。

**Architecture:** 8本の解説コンテンツを型付きJSONで管理し、共通TypeScriptジェネレーターから静的HTMLを生成する。生成ページは既存のカード・レシピ・デッキビルダーへ接続し、既存の同意後GA4送信、サイトマップ、PWA、共有画像へ必要最小限の拡張を加える。コンテンツ内容と参照IDはビルド前に検証し、存在しないカード・40枚でないレシピ・重複slug・未入力テンプレートを公開しない。

**Tech Stack:** TypeScript 5.6、tsx、Node.js test runner、静的HTML、Tailwind CSS、バニラJavaScript、Playwright、GA4 Data API、GitHub Pages

---

## 実装前提

- 設計書: `docs/plans/2026-09-03-organic-user-growth-design.md`
- 既存の生成起点: `scripts/build-card-pages.ts:1303`
- SPAのURL同期: `public/index.html:1118`
- デッキURL復元: `public/index.html:1622`
- GA4共通関数: `public/js/analytics.js:36`
- 既存のデッキ共有画像: `public/index.html:2196`
- 生成物である `public/guide/`、`public/deck-guide/`、`public/guides/index.html` は、現在のプロジェクト方針に従いコミット対象とする。
- 「低予算」は価格保証を意味しない。価格データがないため、ページ上では「低レアリティ中心で始めやすい候補」と説明し、購入前の実価格確認を促す。

### Task 1: コンテンツ型と厳格な検証を追加する

**Files:**

- Create: `src/growth/growth-pages.ts`
- Create: `src/verify/growth-pages.test.ts`
- Create: `data/content/growth-pages.json`

**Step 1: Write the failing schema tests**

`src/verify/growth-pages.test.ts` に、最小fixtureと本番JSONの検証を追加する。

```ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateGrowthPages } from '../growth/growth-pages.js'

test('8本のslugとcanonical pathが一意である', async () => {
  const pages = JSON.parse(await readFile('data/content/growth-pages.json', 'utf8'))
  const result = validateGrowthPages(pages, { cards: [], recipes: [], allowMissingReferences: true })
  assert.equal(result.pages.length, 8)
  assert.equal(new Set(result.pages.map(p => p.slug)).size, 8)
})

test('存在しないrelatedCardIdと40枚でないfeaturedRecipeIdを拒否する', () => {
  assert.throws(() => validateGrowthPages([
    {
      kind: 'deck-guide', slug: 'bad', title: '十分に長いタイトル',
      description: '検索結果に表示する十分な説明文です。', lead: '導入文',
      sections: [{ heading: '概要', paragraphs: ['本文です。'] }],
      relatedCardIds: ['missing'], featuredRecipeId: 'short'
    }
  ], {
    cards: [{ id: 'known', name: '既知カード' }],
    recipes: [{ id: 'short', poolStatus: 'in', cards: [{ id: 'known', count: 39 }] }]
  }), /relatedCardIds|40枚/)
})

test('重複slug、空section、テンプレート残骸を拒否する', () => {
  // `TODO`、`要確認`、`{{...}}`、空配列を個別subtestで渡し、例外を確認する。
})
```

**Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/verify/growth-pages.test.ts`

Expected: FAIL with `Cannot find module '../growth/growth-pages.js'`.

**Step 3: Implement the typed validator**

`src/growth/growth-pages.ts` に次の公開型と関数を実装する。

```ts
export type GrowthPageKind = 'guide' | 'deck-guide'

export interface GrowthSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export interface GrowthPage {
  kind: GrowthPageKind
  slug: string
  title: string
  description: string
  lead: string
  sections: GrowthSection[]
  relatedCardIds: string[]
  featuredRecipeId?: string
  references?: { label: string; url: string }[]
}

export function growthPagePath(page: GrowthPage): string {
  return `${page.kind}/${page.slug}/`
}

export function validateGrowthPages(
  input: unknown,
  sources: {
    cards: { id: string; name: string }[]
    recipes: { id: string; poolStatus?: string; cards?: { id: string; count?: number }[] }[]
    allowMissingReferences?: boolean
  }
): { pages: GrowthPage[] } {
  // 配列、8件、一意slug、許可kind、title/description/lead、1個以上のsectionを検証。
  // slugは /^[a-z0-9]+(?:-[a-z0-9]+)*$/ のみ許可。
  // TODO / 要確認 / {{...}} を公開エラーにする。
  // relatedCardIdsはcards.jsonに存在するIDだけを許可。
  // deck-guideはfeaturedRecipeId必須、poolStatus === 'in'、合計40枚を必須にする。
  // referencesはhttps URLだけを許可する。
  throw new Error('not implemented')
}
```

エラーは最初の1件で止めず、`growth-pages.json: <slug>: <reason>` の形式で集約して投げる。

**Step 4: Add a minimal valid production skeleton**

`data/content/growth-pages.json` に8件のslugと仮ではない短い導入・最小sectionを入れる。この時点でカード・レシピ参照を空にできるのは `guide` だけとし、`deck-guide` はTask 4まで `allowMissingReferences` をテスト以外で使わない。

予定slug:

```json
[
  "classic08-getting-started",
  "classic05-vs-classic08",
  "classic08-restrictions",
  "shinobi-dorugeza",
  "black-green-rush",
  "nekura-fernando",
  "bolmeteus-control",
  "beginner-low-rarity-deck"
]
```

**Step 5: Run tests**

Run: `npx tsx --test src/verify/growth-pages.test.ts`

Expected: PASS. Invalid fixture tests must prove that broken IDs and a 39-card recipe are rejected.

**Step 6: Commit**

```bash
git add src/growth/growth-pages.ts src/verify/growth-pages.test.ts data/content/growth-pages.json
git commit -m "feat(growth): add validated guide content schema"
```

### Task 2: SEOページの共通レンダラーをTDDで追加する

**Files:**

- Create: `src/growth/render-growth-page.ts`
- Create: `src/verify/render-growth-page.test.ts`

**Step 1: Write failing rendering tests**

以下を文字列DOM契約として検証する。

```ts
test('固有SEOメタデータ、OGP、ArticleとBreadcrumbListを生成する', () => {
  const html = renderGrowthPage(page, context)
  assert.match(html, /<link rel="canonical" href="https:\/\/t1k2a\.github\.io\/duelmasters-classic08-database\/guide\/classic08-getting-started\/">/)
  assert.match(html, /property="og:title"/)
  assert.match(html, /"@type":"Article"/)
  assert.match(html, /"@type":"BreadcrumbList"/)
})

test('本文、カード、外部参照をescapeし外部リンクを保護する', () => {
  const html = renderGrowthPage(maliciousPage, context)
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /rel="noopener noreferrer"/)
})

test('deck-guideだけにコピーして編集CTAを出す', () => {
  const html = renderGrowthPage(deckPage, context)
  assert.match(html, /\?recipe=rcp-3828/)
  assert.match(html, /data-growth-cta="copy_deck"/)
})
```

**Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/verify/render-growth-page.test.ts`

Expected: FAIL with missing `renderGrowthPage`.

**Step 3: Implement minimal renderer helpers**

公開APIは次に固定する。

```ts
export interface GrowthRenderContext {
  siteUrl: string
  cardsById: Map<string, CardSummary>
  recipesById: Map<string, RecipeSummary>
  allPages: GrowthPage[]
  analyticsDepth: '../' | '../../'
}

export function escapeHtml(value: string): string
export function renderGrowthPage(page: GrowthPage, context: GrowthRenderContext): string
export function renderGrowthHub(pages: GrowthPage[], context: GrowthRenderContext): string
```

テンプレートに必須の要素:

- `<html lang="ja">`
- 固有`title`、`description`、`canonical`
- `og:type=article`、Twitter Card
- `Article`と`BreadcrumbList`のJSON-LD
- ホーム、ガイド一覧、現在ページのパンくず
- `<main><article>`内の静的本文
- 関連カードへの `/card/{id}/` リンク
- 関連ガイドへの文脈リンク
- `deck-guide`の `../../?recipe={featuredRecipeId}&utm_source=site&utm_medium=guide&utm_campaign=organic_growth`
- `public/js/analytics-config.js` と `public/js/analytics.js`
- JS無効時にも本文とCTAリンクが機能すること

JSON-LDは `JSON.stringify(...).replace(/</g, '\\u003c')` して`</script>`注入を防ぐ。

**Step 4: Run rendering tests**

Run: `npx tsx --test src/verify/render-growth-page.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/growth/render-growth-page.ts src/verify/render-growth-page.test.ts
git commit -m "feat(growth): add static SEO guide renderer"
```

### Task 3: 静的生成コマンドとハブをビルド経路へ接続する

**Files:**

- Create: `scripts/build-growth-pages.ts`
- Modify: `package.json:6-13`
- Modify: `tailwind.config.js:1-5`
- Modify: `scripts/build-card-pages.ts:18-29,1303-1498`
- Test: `src/verify/growth-pages.test.ts`

**Step 1: Write a failing build integration test**

一時ディレクトリに生成して、ハブ1件・本文8件・manifestが揃うことを検証できるよう、build関数へ出力先を注入する。

```ts
test('hubと8本を決定的に生成する', async () => {
  const out = await mkdtemp(join(tmpdir(), 'growth-pages-'))
  const result = await buildGrowthPages({ publicDir: out, contentFile, cardsFile, recipesFile })
  assert.equal(result.urls.length, 9)
  await access(join(out, 'guides/index.html'))
  await access(join(out, 'deck-guide/shinobi-dorugeza/index.html'))
})
```

**Step 2: Run and verify failure**

Run: `npx tsx --test src/verify/growth-pages.test.ts`

Expected: FAIL because `buildGrowthPages` does not exist.

**Step 3: Implement the build command**

`scripts/build-growth-pages.ts` は以下を行う。

1. `data/content/growth-pages.json`、`public/cards.json`、`public/data/recipes.json`を読む。
2. `validateGrowthPages`を呼ぶ。
3. `public/guides/index.html`を生成する。
4. kind別のディレクトリに8ページを生成する。
5. `{ path, title, kind, relatedCardIds, featuredRecipeId }[]` を返す。
6. CLI直接実行時だけ`main()`を呼ぶ。

`package.json`には以下を追加する。

```json
"build:growth-pages": "tsx scripts/build-growth-pages.ts"
```

全体build順は、JSON・レシピ・制限データ生成後、CSSより前にgrowth pagesを生成し、最後にcard pagesでサイトマップを確定する。

```json
"build": "tsx scripts/build-analytics-config.ts && tsx scripts/build-json.ts && tsx scripts/annotate-recipe-pool.ts && tsx scripts/build-meta-decks.ts && tsx scripts/build-restrictions.ts && tsx scripts/build-deck-legality-js.ts && tsx scripts/build-growth-pages.ts && npm run build:css && tsx scripts/build-card-pages.ts"
```

`scripts/build-card-pages.ts` は検証済みgrowth page一覧を読み、次をサイトマップに追加する。

```ts
`${SITE}/guides/`
...pages.map(page => `${SITE}/${growthPagePath(page)}`)
```

`tailwind.config.js`のcontentには`./src/growth/**/*.ts`を追加する。

**Step 4: Run focused tests and build**

Run: `npx tsx --test src/verify/growth-pages.test.ts src/verify/render-growth-page.test.ts`

Expected: PASS.

Run: `npm run build:growth-pages && npm run build:css && npm run build:card-pages`

Expected: 8 content pages plus hub generated; `public/sitemap.xml` includes all 9 URLs.

**Step 5: Commit**

```bash
git add scripts/build-growth-pages.ts package.json tailwind.config.js scripts/build-card-pages.ts public/guides public/guide public/deck-guide public/sitemap.xml public/css/tailwind.css
git commit -m "feat(growth): generate SEO guide pages"
```

### Task 4: 3本の基礎ページを実データで完成させる

**Files:**

- Modify: `data/content/growth-pages.json`
- Modify: `src/verify/growth-pages.test.ts`
- Reference: `public/data/classic05-pool.json`
- Reference: `public/data/classic08-restrictions.json`
- Reference: `README.md`

**Step 1: Write failing content-contract tests**

3ページに必要な見出しと内部リンク対象を固定する。

```ts
const requiredSections = {
  'classic08-getting-started': ['クラシック08とは', '必要なもの', 'デッキを組む', '対戦までの流れ'],
  'classic05-vs-classic08': ['カードプール', 'レギュレーション', 'どちらを選ぶか'],
  'classic08-restrictions': ['殿堂', 'プレミアム殿堂', 'お助けカード', '確認方法'],
}
```

テストでは各語を含む見出し、本文合計600文字以上、関連カード3件以上、別ガイドへのリンク候補1件以上を要求する。固定のカード枚数はREADMEへ重複記載せず、ビルド時データから表示する設計にする。

**Step 2: Run and verify failure**

Run: `npx tsx --test src/verify/growth-pages.test.ts`

Expected: FAIL with missing sections/body length.

**Step 3: Author the three pages**

執筆ルール:

- クラシック05/08のカード範囲は`public/data/classic05-pool.json`と`public/cards.json`から算出する。
- 制限カード名・枚数は`public/data/classic08-restrictions.json`を唯一のデータソースにする。
- 現行公式レギュレーションとクラシック08独自ルールを混同しない。
- 出典リンクを付け、外部情報のコピーではなく要約とサイト内の操作説明を書く。
- 非公式・非営利のファンメイドであることをフッターに表示する。

**Step 4: Rebuild and inspect generated HTML**

Run: `npm run build:growth-pages`

Expected: PASS and no `TODO`/`要確認` in generated HTML.

Run: `grep -RInE 'TODO|要確認|\{\{' public/guides public/guide public/deck-guide`

Expected: no output, exit code 1.

**Step 5: Commit**

```bash
git add data/content/growth-pages.json src/verify/growth-pages.test.ts public/guides public/guide
git commit -m "content(growth): add Classic 08 starter guides"
```

### Task 5: 5本のデッキガイドとコピー導線を完成させる

**Files:**

- Modify: `data/content/growth-pages.json`
- Modify: `src/verify/growth-pages.test.ts`
- Modify: `src/growth/render-growth-page.ts`
- Test: `src/verify/render-growth-page.test.ts`
- Reference: `public/data/recipes.json`
- Reference: `public/data/meta-decks.json`

**Step 1: Write failing recipe-integrity tests**

各deck-guideについて次を検証する。

- `featuredRecipeId`が存在する。
- `poolStatus === 'in'`。
- 合計40枚。
- 全カードIDが`cards.json`に存在する。
- ページ名の主要カードがレシピに含まれる。
- サンプルがサイト集計値である場合、大会成績と表現しない。

初期候補は次の通り。ただし実装時に制限検証へ通らない場合は、同一アーキタイプの合法な40枚レシピへ差し替える。

```ts
const featured = {
  'shinobi-dorugeza': 'rcp-3828',
  'black-green-rush': 'rcp-3716',
  'nekura-fernando': 'rcp-5850',
  'bolmeteus-control': 'rcp-1756',
  'beginner-low-rarity-deck': 'rcp-0114',
}
```

`rcp-5850`は光・自然・闇かつ《魔光帝フェルナンドVII世》4枚の40枚レシピ、`rcp-0114`はSR/VRを含まない赤単速攻候補として選定した。価格を保証する根拠には使わない。

**Step 2: Run and verify failure**

Run: `npx tsx --test src/verify/growth-pages.test.ts src/verify/render-growth-page.test.ts`

Expected: FAIL until all deck-guide content and CTA contracts are present.

**Step 3: Author deck-guide content**

各ページに次を含める。

1. デッキの狙い
2. 主要カードと役割
3. 序盤・中盤・終盤の基本方針
4. 苦手な状況と調整候補
5. サンプルは収録レシピの一例であり確定リストではない旨
6. レシピをコピーして編集するCTA

「最強」「確定版」「必ず勝てる」など検証不能な断定は使わない。低予算ページは「低レアリティ中心」であることと、実売価格は店舗・状態で変わることを明記する。

**Step 4: Add CTA analytics attributes**

レンダラーのCTAはJSがなくてもリンクとして機能させ、GA4が使える場合だけイベント送信する。

```html
<a href="../../?recipe=rcp-3828&utm_source=site&utm_medium=guide&utm_campaign=organic_growth"
   data-growth-cta="copy_deck"
   data-content-id="shinobi-dorugeza"
   onclick="if(window.trackEvent)window.trackEvent('content_cta_click',{content_id:'shinobi-dorugeza',destination_type:'deck_builder'})">
  このデッキをコピーして編集
</a>
```

値は必ず`escapeHtml`または`scriptJson`を通す。

**Step 5: Rebuild and run tests**

Run: `npm run build:growth-pages && npx tsx --test src/verify/growth-pages.test.ts src/verify/render-growth-page.test.ts`

Expected: PASS, 5 deck guide pages each have one copy CTA and one valid 40-card recipe.

**Step 6: Commit**

```bash
git add data/content/growth-pages.json src/growth/render-growth-page.ts src/verify/growth-pages.test.ts src/verify/render-growth-page.test.ts public/deck-guide public/guides
git commit -m "content(growth): add five actionable deck guides"
```

### Task 6: ナビゲーションと文脈内部リンクを接続する

**Files:**

- Modify: `public/index.html:112-116`
- Modify: `scripts/build-card-pages.ts:900-1040,1307-1339`
- Modify: `src/growth/render-growth-page.ts`
- Modify: `src/verify/render-growth-page.test.ts`
- Modify: `scripts/e2e.mjs`

**Step 1: Write failing navigation tests**

- トップナビに`guides/`への「遊び方・デッキ解説」がある。
- ガイドの`relatedCardIds`に指定されたカード詳細に「関連ガイド」が出る。
- featured recipeページに対応デッキガイドへのリンクが出る。
- すべてのリンクが同一サイト内の正しい相対URLになる。

**Step 2: Run and verify failure**

Run: `npx tsx --test src/verify/render-growth-page.test.ts`

Expected: FAIL with missing internal links.

**Step 3: Add internal-link lookups**

`scripts/build-card-pages.ts`で以下の索引を作る。

```ts
const guidesByCardId = new Map<string, GrowthPage[]>()
const guideByRecipeId = new Map<string, GrowthPage>()
```

`cardPageHtml(card, relatedGuides)`と`deckPageHtml({... relatedGuide })`へ安全に渡し、最大3件だけ表示する。ガイド側は主要カード、同じkindの関連ガイド、ハブへのリンクを表示する。

**Step 4: Add browser E2E cases**

`scripts/e2e.mjs`へ以下を追加する。

- ホームからガイドハブへ移動できる。
- ハブからシノビドルゲーザへ移動できる。
- CTAのhrefに`recipe=rcp-3828`がある。
- CTA遷移後にデッキパネルが40/40で開く。

テスト件数のヘッダーコメントも更新する。

**Step 5: Run tests**

Run: `npm run build:growth-pages && npm run build:card-pages && npm run test:e2e`

Expected: all existing and added cases PASS.

**Step 6: Commit**

```bash
git add public/index.html scripts/build-card-pages.ts src/growth/render-growth-page.ts src/verify/render-growth-page.test.ts scripts/e2e.mjs public/card public/recipe public/guides public/guide public/deck-guide public/sitemap.xml
git commit -m "feat(growth): connect guides to cards and deck builder"
```

### Task 7: 成長イベントを重複なく計測する

**Files:**

- Modify: `public/index.html:1077-1284,1604-1653,2077-2175`
- Modify: `public/js/analytics.js:29-46`
- Modify: `scripts/e2e.mjs`

**Step 1: Write failing analytics E2E cases**

テストではネットワークへGAを送らず、ページ読込前に`window.trackEvent`をspyへ差し替える。次を検証する。

- 同じカード詳細を開いても`view_card_detail`は表示操作ごとに1回。
- 39→40枚になった瞬間だけ`deck_complete`が1回。
- 40→39→40では新しい完成としてもう1回。
- `?recipe=`復元で`copy_deck`が1回、通常localStorage復元では発火しない。
- PWA prompt表示で`pwa_install_prompt`、受諾完了で`pwa_install`。
- 空デッキ共有では`share_deck`を送らない。

**Step 2: Run and verify failure**

Run: `npm run test:e2e && npm run test:e2e:deck-legality`

Expected: new cases FAIL; existing cases remain PASS.

**Step 3: Add a safe analytics helper**

`public/js/analytics.js`に、同一ページ内の意図しない二重送信を止めるオプションを追加する。

```js
var sentOnce = new Set()
window.trackEventOnce = function (key, eventName, params) {
  if (sentOnce.has(key)) return
  sentOnce.add(key)
  window.trackEvent(eventName, params)
}
```

同意前や測定ID未設定時は、従来どおり外部スクリプトを読み込まない。個人情報、自由入力検索語、カード名、デッキ名は新規イベントパラメータへ送らず、`card_id`、`content_id`、`method`、`card_count`など低カーディナリティ値に限定する。

**Step 4: Instrument product actions**

- `selectCard`: `view_card_detail`
- `addToDeck` / `removeFromDeck`: 40枚境界で`deck_complete`
- `restoreRecipeFromURL`: URL流入時だけ`copy_deck`
- `shareDeckX` / `exportDeckImage`: 入力妥当性確認後に`share_deck`
- PWA: prompt表示・`appinstalled`

**Step 5: Run tests**

Run: `npm run test:e2e && npm run test:e2e:deck-legality`

Expected: PASS with exact event counts.

**Step 6: Commit**

```bash
git add public/index.html public/js/analytics.js scripts/e2e.mjs
git commit -m "feat(analytics): measure organic growth funnel"
```

### Task 8: 検索条件共有とデッキ画像QRを追加する

**Files:**

- Modify: `package.json:47-63`
- Modify: `package-lock.json`
- Modify: `public/index.html:140-220,1115-1168,2196-2365`
- Modify: `scripts/e2e.mjs`
- Create: `scripts/copy-vendor-assets.ts`
- Generate: `public/js/vendor/qrcode.js`

**Step 1: Write failing UX tests**

- 絞り込み後の「検索条件を共有」が現在の`q`、文明、カード種、コスト、種族、セット、パワー、レアリティ、能力、05絞り込み、ソートだけを含むURLをコピーする。
- `d`、`recipe`など検索以外の状態を混ぜない。
- 生成デッキ画像にサイト名、復元URL文字列、QR領域がある。
- QR生成を意図的に失敗させてもPNG出力・Web Share API fallbackは継続する。

**Step 2: Run and verify failure**

Run: `npm run test:e2e && npm run test:e2e:deck-legality`

Expected: new cases FAIL.

**Step 3: Bundle a local QR dependency**

`qrcode-generator`を固定バージョンで通常dependencyへ追加し、`scripts/copy-vendor-assets.ts`でブラウザ用配布ファイルを`public/js/vendor/qrcode.js`へコピーする。ビルドに`tsx scripts/copy-vendor-assets.ts`を追加する。CDNと外部QR APIは使わない。

コピー元・ライセンスファイルが存在しない場合はビルドを失敗させる。配布ライセンスを`public/js/vendor/`へ併置する。

**Step 4: Implement explicit search sharing**

既存`syncURL()`と同じ許可リストを使う`buildSearchURL()`を追加し、ボタンからClipboard API、Web Share APIの順で共有する。現在URL全体の無条件コピーはしない。

**Step 5: Add QR to exported deck image**

`buildDeckURL()`の完全URLからQRを生成し、`exportDeckImage()`の右下に描画する。QRライブラリ未読込・例外時は従来フッターを描画して続行する。

```js
async function drawDeckQr(ctx, url, x, y, size) {
  try {
    if (typeof qrcode !== 'function') return false
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    // module countからcanvasへ白背景と黒セルを描画する。
    return true
  } catch {
    return false
  }
}
```

**Step 6: Run tests**

Run: `npm run test:e2e && npm run test:e2e:deck-legality && node scripts/test-deck-url.mjs`

Expected: PASS; forced QR failure case still produces a non-empty PNG blob.

**Step 7: Commit**

```bash
git add package.json package-lock.json scripts/copy-vendor-assets.ts public/js/vendor public/index.html scripts/e2e.mjs
git commit -m "feat(growth): add shareable searches and deck QR"
```

### Task 9: Search Console運用とGA4週次レポートを整える

**Files:**

- Create: `docs/growth/search-console-runbook.md`
- Modify: `scripts/ga4-analytics.ts:47-73,195-307`
- Create: `src/verify/ga4-growth-report.test.ts`
- Modify: `.github/workflows/ga4-weekly-report.yml`

**Step 1: Write failing report-format tests**

集計ロジックを副作用のない関数としてexportし、次を検証する。

```ts
test('成長ファネルをゼロ除算せず出力する', () => {
  const report = renderGrowthFunnel({
    activeUsers: 47, organicUsers: 0, viewCardDetail: 0,
    copyDeck: 0, deckComplete: 0, shareDeck: 0, pwaInstall: 0
  })
  assert.match(report, /オーガニック検索/)
  assert.doesNotMatch(report, /NaN|Infinity/)
})
```

**Step 2: Run and verify failure**

Run: `npx tsx --test src/verify/ga4-growth-report.test.ts`

Expected: FAIL with missing export.

**Step 3: Extend GA4 aggregation**

GA4 Data APIから以下を取得する。

- `sessionDefaultChannelGroup`別アクティブユーザー
- `eventName`別 `view_card_detail`、`copy_deck`、`deck_complete`、`share_deck`、`pwa_install`、`content_cta_click`
- `pagePath`別のガイド入口セッション
- 7日/28日の比較に必要な期間値

既存のmockにもゼロ値を明示し、本番認証情報なしで週次workflowが破綻しないようにする。

**Step 4: Write the Search Console runbook**

runbookには以下だけを書く。

1. GitHub Pages URLのURL-prefix property登録
2. 所有権確認方法
3. `sitemap.xml`送信
4. ページ、インデックス、検索パフォーマンスの週次確認
5. 上位クエリ、表示回数、CTR、平均掲載順位を保存するテンプレート
6. クロール済み未登録や重複ページの判断手順

秘密値はリポジトリへ保存しない。Search Console API自動化はデータが蓄積して必要性が確認されるまで行わない。

**Step 5: Wire the new test into CI**

テストを`src/verify/*.test.ts`配下に置くため既存`npm test`に自動で含まれることを確認する。workflowには週次出力の要約を`GITHUB_STEP_SUMMARY`へ追記する。

**Step 6: Run tests**

Run: `npm test`

Expected: all tests PASS including zero-data report test.

Run: `GA4_MOCK=true npx tsx scripts/ga4-analytics.ts`

Expected: report is generated without credentials and contains the organic-growth funnel section.

**Step 7: Commit**

```bash
git add docs/growth/search-console-runbook.md scripts/ga4-analytics.ts src/verify/ga4-growth-report.test.ts .github/workflows/ga4-weekly-report.yml
git commit -m "feat(analytics): report weekly organic growth funnel"
```

### Task 10: 全体検証、失敗系確認、レビューを行う

**Files:**

- Modify if required: files changed in Tasks 1-9 only
- Review: all changes since `e43a92dd16`

**Step 1: Verify clean generation**

Run: `npm run build`

Expected: exit code 0; 8 growth pages and one hub generated; sitemap URL count increases by 9.

**Step 2: Run static and unit checks**

Run: `npm test`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run verify:pool && npm run verify:x-queue`

Expected: PASS.

**Step 3: Run browser checks**

Run: `npm run test:e2e`

Expected: all cases PASS.

Run: `npm run test:e2e:deck-legality`

Expected: all cases PASS.

Run: `node scripts/test-deck-url.mjs`

Expected: every recipe round-trip PASS.

**Step 4: Prove safeguards detect broken input**

一時fixtureだけを使い、次が非ゼロ終了になることを確認する。追跡中の本番JSONは変更しない。

- 存在しないカードID
- 39枚featured recipe
- 重複slug
- `TODO`を含む本文
- QR vendor asset欠落

Expected: each case fails with a specific error; normal fixtures still pass afterward.

**Step 5: Inspect generated pages visually**

Playwrightで次を375pxと1440px、ライト/ダークテーマで撮影して確認する。

- `public/guides/index.html`
- `public/guide/classic08-getting-started/index.html`
- `public/deck-guide/shinobi-dorugeza/index.html`
- デッキ40枚完成パネル
- QR付き共有画像

確認項目: 横スクロールなし、見出し階層、コントラスト、キーボードフォーカス、画像失敗fallback、CTAの視認性。

**Step 6: Run mandatory reviewer audit**

`requesting-code-review`スキルを使い、セキュリティ、SEO、構造化データ、a11y、モバイル、計測重複、生成物差分をレビューする。指摘があれば修正し、Step 1から再実行する。

**Step 7: Final commit**

```bash
git status --short
git add <review fixes only>
git commit -m "fix(growth): address final growth rollout review"
```

差分がなければ空コミットは作らない。pushはユーザーが明示的に依頼した場合だけ行い、その直前にプロジェクト必須の`npm run build`とReviewer LGTMを再確認する。

## 公開後の判定

公開日をDay 0として、7日ごとに次を記録する。

| 指標 | Day 0 | Day 7 | Day 14 | Day 21 | Day 28 |
|---|---:|---:|---:|---:|---:|
| 月間相当アクティブユーザー | 47 | | | | 目標100 |
| Organic Searchユーザー | | | | | |
| Search Console表示回数 | | | | | |
| Search Consoleクリック数 | | | | | |
| `copy_deck` | | | | | |
| `deck_complete` | | | | | |
| `share_deck` | | | | | |
| 7日以内再訪率 | | | | | |

Day 28時点で、検索表示が増えない場合はインデックス・検索意図・重複判定を見直す。表示は増えてクリックされない場合はtitle/descriptionを改善する。流入は増えてデッキ操作が増えない場合は本文とCTAの接続を改善する。PVだけで継続判断しない。
