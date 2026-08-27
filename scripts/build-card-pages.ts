/**
 * Build script: generate per-card / per-recipe static pages, robots.txt and sitemap.xml.
 *
 * Reads public/cards.json, public/data/recipes.json, public/data/meta-decks.json and emits:
 *   - public/card/{id}/index.html        (OGP / Twitter Card / JSON-LD + 静的コンテンツ + アプリへのリンク)
 *   - public/recipe/{rcp-id}/index.html  (deck OGP + 静的カードリスト + アプリへのリンク)
 *   - public/recipe/meta-{n}/index.html  (meta deck OGP + 静的カードリスト + アプリへのリンク)
 *   - public/robots.txt
 *   - public/sitemap.xml
 *
 * クローラにリダイレクト扱いされてロングテール検索資産が死ぬのを防ぐため、
 * <body> には実コンテンツを静的描画し、即時リダイレクト（refresh=0 / location.replace）は行わない。
 * アプリ（SPA）へは通常リンク / 遷移ボタンで案内する。
 *
 * Usage: npm run build:card-pages
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '../public')
const CARDS_FILE = join(PUBLIC_DIR, 'cards.json')
const RECIPES_FILE = join(PUBLIC_DIR, 'data/recipes.json')
const META_FILE = join(PUBLIC_DIR, 'data/meta-decks.json')

const SITE = 'https://t1k2a.github.io/duelmasters-classic08-database'
const IMG_BASE = 'https://dm.takaratomy.co.jp/wp-content/card/cardimage'

interface CardPrinting {
  setCode: string
  cardNumber: string
  rarity?: string
}

interface CardJson {
  id: string
  name: string
  cardType: string
  cost: number | null
  power: number | null
  civilizations: string[]
  races: string[]
  rarity: string | null
  text: string | null
  printings?: CardPrinting[]
  setsContaining?: string[]
}

interface DeckCard {
  id: string
  name?: string
  count: number
}

interface RecipeJson {
  id: string
  name: string
  cards: DeckCard[]
  civilizations?: string[]
  archetype?: string
  author?: string
}

interface MetaDeckJson {
  name: string
  description?: string
  civilization?: string[]
  cards: DeckCard[]
}

const RARITY_ORDER: Record<string, number> = { SR: 0, VR: 1, R: 2, U: 3, C: 4 }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function jsonLdEscape(s: string): string {
  // Escape for embedding inside a <script type="application/ld+json"> block.
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

// SPA(public/index.html)と同じ文明カラー。静的ページでも見た目を揃える。
const PAGE_STYLE = `
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .civ-光  { background:#fef9c3; border-color:#ca8a04; color:#713f12; }
    .civ-水  { background:#dbeafe; border-color:#3b82f6; color:#1e3a8a; }
    .civ-闇  { background:#f3e8ff; border-color:#9333ea; color:#581c87; }
    .civ-火  { background:#fee2e2; border-color:#ef4444; color:#7f1d1d; }
    .civ-自然 { background:#dcfce7; border-color:#22c55e; color:#14532d; }`

const CIV_CLASS: Record<string, string> = {
  光: 'civ-光', 水: 'civ-水', 闇: 'civ-闇', 火: 'civ-火', 自然: 'civ-自然',
}

function civBadges(civs: string[]): string {
  return civs
    .map(c => `<span class="${CIV_CLASS[c] ?? ''} border rounded-full px-2 py-0.5 text-xs font-medium">${escapeHtml(c)}</span>`)
    .join(' ')
}

// <script> ブロック内に文字列を埋め込む際、"</script>" で早期クローズされるのを防ぐ。
// JSON-LD 側と同様に < を < へ退避する。
function scriptJson(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// X投稿intentリンクを組み立てる（public/index.html shareDeckX() と同方式）。
// hashtags パラメータはカンマ区切り・#なし。
const SHARE_HASHTAGS_PARAM = 'デュエマ,デュエマクラシック08'

function xIntentUrl(shareTitle: string, shareUrl: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}&hashtags=${encodeURIComponent(SHARE_HASHTAGS_PARAM)}`
}

// navigator.share + クリップボード fallback（public/index.html:1231 shareDeck() と同方式）。
function shareScript(shareTitle: string, shareUrl: string): string {
  return `<script>
function shareCard() {
  var url = ${scriptJson(shareUrl)};
  var title = ${scriptJson(shareTitle)};
  if (navigator.share) {
    navigator.share({ title: title, text: title, url: url })
      .then(function () { showToast('共有しました'); })
      .catch(function (error) {
        if (error.name !== 'AbortError') showToast('共有に失敗しました');
      });
    return;
  }
  if (!navigator.clipboard) {
    showToast('この環境では共有に対応していません');
    return;
  }
  navigator.clipboard.writeText(title + '\\n' + url)
    .then(function () { showToast('共有URLをコピーしました'); })
    .catch(function () { showToast('コピーに失敗しました'); });
}
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  // display:none だとライブリージョンがアクセシビリティツリーから外れ、
  // textContent の更新が支援技術に通知されない。opacity で視覚的にのみ隠す。
  t.classList.remove('opacity-0', 'pointer-events-none');
  t.textContent = msg;
  setTimeout(function () { t.classList.add('opacity-0', 'pointer-events-none'); }, 2000);
}
</script>`
}

// 生成ページ（card/{id}/・recipe/{slug}/ いずれも2階層下）共通のフッター＋GA4スニペット。
// 測定IDは public/js/analytics.js の1箇所で設定する（プレースホルダなら何もしない安全側実装）。
// リダイレクトを廃止した実コンテンツページに載るため、同意バナー＋計測がそのまま機能する。
const PAGE_FOOTER = `  <script src="../../js/analytics-config.js"></script>
  <script src="../../js/analytics.js"></script>`


// カード詳細ページ専用の自己完結型Vanilla CSS
const CARD_PAGE_CSS = `
:root {
  --font-sans: 'Plus Jakarta Sans', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-display: 'Outfit', 'Noto Sans JP', sans-serif;

  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-subtle: #f1f5f9;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --text-light: #94a3b8;
  --border-color: #e2e8f0;

  --primary: #4f46e5;
  --primary-hover: #4338ca;
  --primary-light: #eef2ff;

  --civ-light-bg: #fef9c3;
  --civ-light-border: #ca8a04;
  --civ-light-text: #713f12;
  --civ-light-glow: rgba(234, 179, 8, 0.35);

  --civ-water-bg: #e0f2fe;
  --civ-water-border: #0284c7;
  --civ-water-text: #0369a1;
  --civ-water-glow: rgba(2, 132, 199, 0.35);

  --civ-dark-bg: #f3e8ff;
  --civ-dark-border: #9333ea;
  --civ-dark-text: #581c87;
  --civ-dark-glow: rgba(147, 51, 234, 0.35);

  --civ-fire-bg: #fee2e2;
  --civ-fire-border: #ef4444;
  --civ-fire-text: #991b1b;
  --civ-fire-glow: rgba(239, 68, 68, 0.35);

  --civ-nature-bg: #dcfce7;
  --civ-nature-border: #16a34a;
  --civ-nature-text: #14532d;
  --civ-nature-glow: rgba(22, 163, 74, 0.35);

  --shadow-card: 0 12px 28px -6px rgba(15, 23, 42, 0.18), 0 4px 10px -2px rgba(15, 23, 42, 0.08);
}



*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  background-color: var(--bg-page);
  color: var(--text-main);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.top-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background-color: rgba(255, 255, 255, 0.85);
  border-bottom: 1px solid var(--border-color);
  padding: 0.75rem 1rem;
}



.top-nav-inner {
  max-width: 1040px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-main);
  text-decoration: none;
}

.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: linear-gradient(135deg, #4f46e5, #ec4899);
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 800;
}

.nav-back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.nav-back-link:hover {
  background-color: var(--primary-light);
}

.breadcrumb-container {
  max-width: 1040px;
  margin: 1rem auto 0;
  padding: 0 1rem;
  width: 100%;
}

.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
  list-style: none;
}

.breadcrumb a {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.15s ease;
}

.breadcrumb a:hover {
  color: var(--primary);
}

.breadcrumb-separator {
  color: var(--text-light);
}

.breadcrumb-current {
  color: var(--text-main);
  font-weight: 600;
}

.main-content {
  flex: 1;
  max-width: 1040px;
  width: 100%;
  margin: 1.25rem auto 3rem;
  padding: 0 1rem;
}

.card-detail-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

@media (min-width: 768px) {
  .card-detail-layout {
    grid-template-columns: 300px 1fr;
    padding: 2.25rem;
    gap: 2.5rem;
    align-items: start;
  }
}

.card-visual-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}

@media (min-width: 768px) {
  .card-visual-col {
    position: sticky;
    top: 5rem;
  }
}

.card-img-wrapper {
  position: relative;
  width: 100%;
  max-width: 280px;
  margin: 0 auto;
}

.ambient-glow {
  position: absolute;
  inset: -10px;
  border-radius: 24px;
  filter: blur(28px);
  opacity: 0.6;
  z-index: 0;
  pointer-events: none;
}

.card-img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: auto;
  aspect-ratio: 300 / 418;
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  display: block;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
}

.card-img:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 20px 35px -8px rgba(0, 0, 0, 0.3);
}

.card-img-caption {
  font-size: 0.75rem;
  color: var(--text-light);
  margin-top: 0.75rem;
  text-align: center;
  font-family: var(--font-display);
}

.card-info-col {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.card-header-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-title {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-main);
  letter-spacing: -0.02em;
}

@media (min-width: 640px) {
  .card-title {
    font-size: 2.15rem;
  }
}

.badge-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid transparent;
  line-height: 1.2;
}

.badge-generic {
  background-color: var(--bg-card-subtle);
  border-color: var(--border-color);
  color: var(--text-muted);
}

.civ-光  { background: var(--civ-light-bg); border-color: var(--civ-light-border); color: var(--civ-light-text); }
.civ-水  { background: var(--civ-water-bg); border-color: var(--civ-water-border); color: var(--civ-water-text); }
.civ-闇  { background: var(--civ-dark-bg); border-color: var(--civ-dark-border); color: var(--civ-dark-text); }
.civ-火  { background: var(--civ-fire-bg); border-color: var(--civ-fire-border); color: var(--civ-fire-text); }
.civ-自然 { background: var(--civ-nature-bg); border-color: var(--civ-nature-border); color: var(--civ-nature-text); }
.civ-multi {
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(2, 132, 199, 0.2), rgba(239, 68, 68, 0.2));
  border-color: #6366f1;
  color: var(--text-main);
}

.glow-光  { background: var(--civ-light-glow); }
.glow-水  { background: var(--civ-water-glow); }
.glow-闇  { background: var(--civ-dark-glow); }
.glow-火  { background: var(--civ-fire-glow); }
.glow-自然 { background: var(--civ-nature-glow); }
.glow-multi { background: linear-gradient(135deg, var(--civ-fire-glow), var(--civ-water-glow), var(--civ-nature-glow)); }
.glow-neutral { background: rgba(148, 163, 184, 0.25); }

.rarity-SR {
  background: linear-gradient(135deg, #fef08a, #facc15);
  border-color: #ca8a04;
  color: #713f12;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(202, 138, 4, 0.25);
}

.rarity-VR {
  background: linear-gradient(135deg, #f3e8ff, #e9d5ff);
  border-color: #9333ea;
  color: #581c87;
  font-weight: 700;
}

.rarity-R {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1e3a8a;
  font-weight: 600;
}

.rarity-U {
  background: #dcfce7;
  border-color: #22c55e;
  color: #14532d;
}

.rarity-C {
  background: var(--bg-card-subtle);
  border-color: var(--border-color);
  color: var(--text-muted);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.75rem;
  margin-top: 0.25rem;
}

.stat-box {
  background-color: var(--bg-card-subtle);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  color: var(--text-muted);
}

.stat-value {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
}

.stat-value-text {
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: 600;
}

.effect-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.effect-card {
  background-color: var(--bg-card-subtle);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1.1rem 1.25rem;
  font-size: 0.925rem;
  line-height: 1.7;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
}

.keyword-highlight {
  font-weight: 700;
  color: var(--primary);
}

.printings-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.printings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.printing-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background-color: var(--bg-card-subtle);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-display);
}

.printing-tag .set-code {
  font-weight: 700;
  color: var(--text-main);
}

.action-cluster {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border-color);
}

.btn-primary-app {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.85rem 1.5rem;
  border-radius: 12px;
  text-decoration: none;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  border: none;
  cursor: pointer;
}

.btn-primary-app:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.45);
  opacity: 0.96;
}

.secondary-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.6rem 1rem;
  border-radius: 10px;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.btn-secondary:hover {
  background-color: var(--bg-card-subtle);
  border-color: var(--text-light);
  transform: translateY(-1px);
}

.btn-x {
  background-color: #000000;
  color: #ffffff;
  border-color: #000000;
}



.btn-x:hover {
  background-color: #1a1a1a;
  border-color: #333333;
}

.shop-section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.shop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shop-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.shop-badge {
  font-size: 0.65rem;
  font-weight: 500;
  color: var(--text-light);
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.65rem;
}

@media (max-width: 540px) {
  .shop-grid {
    grid-template-columns: 1fr;
  }
}

.shop-card {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 0.5rem;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  text-align: center;
  border: 1px solid transparent;
}

.shop-card:hover {
  transform: translateY(-2px);
}

.shop-surugaya {
  background-color: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}
.shop-surugaya:hover {
  background-color: #fef3c7;
  box-shadow: 0 4px 10px rgba(245, 158, 11, 0.15);
}

.shop-mercari {
  background-color: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
.shop-mercari:hover {
  background-color: #fee2e2;
  box-shadow: 0 4px 10px rgba(239, 68, 68, 0.15);
}

.shop-kanabell {
  background-color: #f0f9ff;
  border-color: #bae6fd;
  color: #0369a1;
}
.shop-kanabell:hover {
  background-color: #e0f2fe;
  box-shadow: 0 4px 10px rgba(2, 132, 199, 0.15);
}



.toast-msg {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background-color: #0f172a;
  color: #ffffff;
  padding: 0.65rem 1.25rem;
  border-radius: 9999px;
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 100;
}



.toast-msg.show {
  opacity: 1;
  transform: translateX(-50%) translateY(-4px);
}

.site-footer {
  margin-top: auto;
  border-top: 1px solid var(--border-color);
  background-color: var(--bg-card);
  padding: 2rem 1rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.footer-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.25rem;
  margin-bottom: 1rem;
}

.footer-nav a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.footer-nav a:hover {
  text-decoration: underline;
}

.footer-disclaimer {
  max-width: 680px;
  margin: 0 auto;
  color: var(--text-light);
  font-size: 0.725rem;
  line-height: 1.6;
}
`


function getCivGlowClass(civs: string[]): string {
  if (!civs || civs.length === 0) return 'glow-neutral'
  if (civs.length > 1) return 'glow-multi'
  const c = civs[0]
  return CIV_CLASS[c] ? `glow-${c}` : 'glow-neutral'
}

function getRarityBadge(rarity: string | null): string {
  if (!rarity) return ''
  const r = rarity.toUpperCase()
  return `<span class="badge rarity-${escapeHtml(r)}">${escapeHtml(r)}</span>`
}

function formatCardText(rawText: string): string {
  const escaped = escapeHtml(rawText)
  const keywords = [
    '進化ー自分の',
    '進化—自分の',
    '進化―自分の',
    '進化-',
    'ブロッカー',
    'W・ブレイカー',
    'T・ブレイカー',
    'Q・ブレイカー',
    'クルーザー',
    'シールド・トリガー',
    'S・トリガー',
    'スレイヤー',
    'パワーアタッカー',
    'ガードマン',
    'タップスキル',
    'マナ武装',
    'シールド・フォース',
    'メテオバーン',
  ]
  let formatted = escaped
  for (const kw of keywords) {
    const escapedKw = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    formatted = formatted.replace(new RegExp(escapedKw, 'g'), `<strong class="keyword-highlight">${kw}</strong>`)
  }
  return formatted
}

function cardPageHtml(card: CardJson): string {
  const url = `${SITE}/card/${card.id}/`
  const image = `${IMG_BASE}/${card.id}.jpg`
  const title = `${card.name} - デュエルマスターズ クラシック08`
  const desc = (card.text ?? card.name).replace(/\s+/g, ' ').trim()
  const appLink = `../../?id=${encodeURIComponent(card.id)}`

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Thing',
    name: card.name,
    description: card.text ?? '',
    image,
    url,
  })

  const civs = (card.civilizations ?? []).map(c =>
    `<span class="badge ${CIV_CLASS[c] ?? 'badge-generic'}">${escapeHtml(c)}</span>`
  ).join(' ')
  const civGlow = getCivGlowClass(card.civilizations ?? [])
  const rarityBadge = getRarityBadge(card.rarity)

  const textBlock = card.text
    ? `<section class="effect-section">
        <span class="section-label">能力・テキスト</span>
        <div class="effect-card">${formatCardText(card.text)}</div>
      </section>`
    : ''

  const printingsList = (card.printings && card.printings.length)
    ? card.printings.map(pr =>
        `<span class="printing-tag"><span class="set-code">${escapeHtml(pr.setCode)}</span> ${escapeHtml(pr.cardNumber)}${pr.rarity ? ` (${escapeHtml(pr.rarity)})` : ''}</span>`
      ).join(' ')
    : ''

  const printingsBlock = printingsList
    ? `<section class="printings-section">
        <span class="section-label">📦 収録パック・型番</span>
        <div class="printings-list">${printingsList}</div>
      </section>`
    : ''

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../css/card-page.css">
  <style>${CARD_PAGE_CSS}</style>
  <script type="application/ld+json">
${jsonLdEscape(jsonLd)}
  </script>
</head>
<body>
  <header class="top-nav">
    <div class="top-nav-inner">
      <a href="../../" class="brand-link">
        <span class="brand-icon">08</span>
        <span>デュエマクラシック08 DB</span>
      </a>
      <a href="${escapeHtml(appLink)}" class="nav-back-link">
        <span>アプリで開く</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
    </div>
  </header>

  <nav class="breadcrumb-container" aria-label="パンくずリスト">
    <ol class="breadcrumb">
      <li><a href="../../">ホーム</a></li>
      <li class="breadcrumb-separator">/</li>
      <li><a href="../../">カード検索</a></li>
      <li class="breadcrumb-separator">/</li>
      <li class="breadcrumb-current" aria-current="page">${escapeHtml(card.name)}</li>
    </ol>
  </nav>

  <main class="main-content">
    <article class="card-detail-layout">
      <div class="card-visual-col">
        <div class="card-img-wrapper">
          <div class="ambient-glow ${civGlow}"></div>
          <img src="${escapeHtml(image)}" alt="${escapeHtml(card.name)}" width="300" height="418"
               class="card-img" loading="eager" fetchpriority="high">
        </div>
        <p class="card-img-caption">DM Classic 08 Database</p>
      </div>

      <div class="card-info-col">
        <div class="card-header-group">
          <h1 class="card-title">${escapeHtml(card.name)}</h1>
          <div class="badge-row">
            ${civs}
            ${rarityBadge}
            ${card.cardType ? `<span class="badge badge-generic">${escapeHtml(card.cardType)}</span>` : ''}
          </div>
        </div>

        <div class="stats-grid">
          ${card.cost != null ? `
          <div class="stat-box">
            <span class="stat-label">マナコスト</span>
            <span class="stat-value">${card.cost}</span>
          </div>` : ''}
          ${card.power != null ? `
          <div class="stat-box">
            <span class="stat-label">パワー</span>
            <span class="stat-value">${card.power.toLocaleString()}</span>
          </div>` : ''}
          ${card.races && card.races.length ? `
          <div class="stat-box" style="grid-column: 1 / -1;">
            <span class="stat-label">種族</span>
            <span class="stat-value-text">${escapeHtml(card.races.join(' / '))}</span>
          </div>` : ''}
        </div>

        ${textBlock}

        ${printingsBlock}

        <div class="action-cluster">
          <a href="${escapeHtml(appLink)}" class="btn-primary-app">
            <span>🎮 アプリで開く（デッキ構築・検索）</span>
          </a>
          <div class="secondary-actions">
            <button type="button" onclick="shareCard()" class="btn-secondary">
              <span>🔗 共有</span>
            </button>
            <a href="${escapeHtml(xIntentUrl(title, url))}" target="_blank" rel="noopener" class="btn-secondary btn-x">
              <span>𝕏 でポスト</span>
            </a>
          </div>
        </div>

        <section class="shop-section">
          <div class="shop-header">
            <span class="shop-title">🛒 このカードを探す・相場を見る</span>
            <span class="shop-badge">外部ショップ</span>
          </div>
          <div class="shop-grid">
            <a href="https://www.surugaya.jp/search?category=5&search_word=${encodeURIComponent('デュエルマスターズ ' + card.name)}"
               target="_blank" rel="noopener noreferrer"
               onclick="if(window.trackEvent)trackEvent('click_buy_card',{card_id:'${card.id}',card_name:'${escapeHtml(card.name)}',shop:'surugaya'})"
               class="shop-card shop-surugaya">
              駿河屋
            </a>
            <a href="https://jp.mercari.com/search?keyword=${encodeURIComponent('デュエルマスターズ ' + card.name)}"
               target="_blank" rel="noopener noreferrer"
               onclick="if(window.trackEvent)trackEvent('click_buy_card',{card_id:'${card.id}',card_name:'${escapeHtml(card.name)}',shop:'mercari'})"
               class="shop-card shop-mercari">
              メルカリ
            </a>
            <a href="https://www.ka-nabell.com/?act=sell_search&genre=dm&word=${encodeURIComponent(card.name)}"
               target="_blank" rel="noopener noreferrer"
               onclick="if(window.trackEvent)trackEvent('click_buy_card',{card_id:'${card.id}',card_name:'${escapeHtml(card.name)}',shop:'ka-nabell'})"
               class="shop-card shop-kanabell">
              カーナベル
            </a>
          </div>
        </section>
      </div>
    </article>
  </main>

  <footer class="site-footer">
    <nav class="footer-nav">
      <a href="../../">データベース トップ</a>
      <a href="../../meta.html">メタゲーム環境</a>
      <a href="../../regulations.html">殿堂レギュレーション</a>
    </nav>
    <p class="footer-disclaimer">
      デュエル・マスターズはタカラトミーおよびウィザーズ・オブ・ザ・コーストの登録商標です。<br>
      当サイトは非公式ファンサイトであり、掲載されているカード画像およびテキストの権利は各権利者に帰属します。
    </p>
  </footer>

  <div id="toast" role="status" aria-live="polite" aria-atomic="true" class="toast-msg"></div>
  ${shareScript(title, url)}
${PAGE_FOOTER}
</body>
</html>
`
}
function getRepresentativeCard(
  deckCards: DeckCard[],
  deckName: string = '',
  byId: Map<string, CardJson>
): CardJson | null {
  let best: CardJson | null = null
  let maxScore = -1

  const cleanDeckName = (deckName || '')
    .toLowerCase()
    .replace(/[\s・\-_【】『』「」()（）]/g, '')

  // デッキ名から2文字以上の部分文字列キーワードを抽出
  const deckKeywords: string[] = []
  if (cleanDeckName.length >= 2) {
    for (let len = cleanDeckName.length; len >= 2; len--) {
      for (let i = 0; i <= cleanDeckName.length - len; i++) {
        deckKeywords.push(cleanDeckName.substring(i, i + len))
      }
    }
  }

  for (const dc of deckCards) {
    const card = byId.get(dc.id)
    if (!card) continue

    let score = 0
    const rawCardName = card.name || ''
    const cleanCardName = rawCardName.toLowerCase().replace(/[\s・\-_]/g, '')

    // 1. デッキ名との部分一致・最長一致判定
    let matchedKwLen = 0
    for (const kw of deckKeywords) {
      if (cleanCardName.includes(kw)) {
        if (kw.length > matchedKwLen) matchedKwLen = kw.length
      }
    }

    if (matchedKwLen >= 3 || (cleanDeckName.length <= 2 && matchedKwLen >= 2)) {
      score += 1000 + matchedKwLen * 10
    } else if (matchedKwLen === 2) {
      score += 500 + matchedKwLen * 10
    }

    // 2. レアリティ重み付け
    const rarity = card.rarity ?? ''
    const rarityWeights: Record<string, number> = { SR: 50, VR: 40, R: 30, U: 20, C: 10 }
    score += rarityWeights[rarity] ?? 35

    // 3. 採用枚数
    score += (dc.count || 1) * 10

    // 4. タイプ・コスト補正
    const type = card.cardType ?? ''
    if (type.includes('進化')) score += 20
    if (type.includes('クリーチャー')) score += 10
    const cost = Number(card.cost) || 0
    if (cost >= 6) score += 15

    if (score > maxScore) {
      maxScore = score
      best = card
    }
  }

  return best
}

function deckTotal(deckCards: DeckCard[]): number {
  return deckCards.reduce((s, c) => s + (c.count || 0), 0)
}

// デッキ内のカードを画像サムネイル + 名前 + 枚数の静的リストで描画する。
function deckCardListHtml(deckCards: DeckCard[], byId: Map<string, CardJson>): string {
  const items = deckCards
    .map(dc => {
      const card = byId.get(dc.id)
      const name = card?.name ?? dc.name ?? dc.id
      const image = `${IMG_BASE}/${dc.id}.jpg`
      return `    <li class="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-2">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" width="40" height="56" class="w-10 rounded" loading="lazy">
      <span class="flex-1 text-sm">${escapeHtml(name)}</span>
      <span class="text-sm font-semibold text-gray-500">×${dc.count || 0}</span>
    </li>`
    })
    .join('\n')
  return `<ul class="grid sm:grid-cols-2 gap-2 mt-4">\n${items}\n  </ul>`
}

/**
 * Generate a deck OGP page (used for both recipes and meta decks).
 * `pathSlug` is the path segment under /recipe/ ; `redirectId` is the rcp-id used in ?recipe=.
 */
function deckPageHtml(opts: {
  pathSlug: string
  redirectId: string
  deckName: string
  cards: DeckCard[]
  civilizations: string[]
  byId: Map<string, CardJson>
  extraDesc?: string
}): string {
  const { pathSlug, redirectId, deckName, cards, civilizations, byId, extraDesc } = opts
  const url = `${SITE}/recipe/${pathSlug}/`
  const top = getRepresentativeCard(cards, deckName, byId)
  const total = deckTotal(cards)
  const image = top ? `${IMG_BASE}/${top.id}.jpg` : `${SITE}/ogp.png`

  const title = `${deckName} — デッキレシピ | デュエマ クラシック08`
  const rarityTag = top && top.rarity ? `【${top.rarity}】` : ''
  const topPart = top ? `${rarityTag}${top.name}入り。` : ''
  const civPart = civilizations.length ? `文明: ${civilizations.join('・')}。` : ''
  const desc = `${topPart}${total}枚デッキ。${civPart}${extraDesc ? ` ${extraDesc}` : ''}`
    .replace(/\s+/g, ' ')
    .trim()
  // recipe/{slug}/index.html から SPA トップへは2階層上（相対パス）。
  const appLink = `../../?recipe=${encodeURIComponent(redirectId)}`

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: deckName,
    description: desc,
    image,
    url,
  })

  const civs = civBadges(civilizations)
  const cardList = deckCardListHtml(cards, byId)

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <link rel="stylesheet" href="../../css/tailwind.css">
  <style>${PAGE_STYLE}</style>
  <script type="application/ld+json">
${jsonLdEscape(jsonLd)}
  </script>
  <script>
    if (!/bot|googlebot|crawler|spider|robot|crawling|facebookexternalhit|slurp|flipboard/i.test(navigator.userAgent)) {
      window.location.replace('${escapeHtml(appLink)}');
    }
  </script>
</head>
<body class="bg-gray-50 text-gray-900">
  <main class="max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold">${escapeHtml(deckName)}</h1>
    <div class="flex flex-wrap items-center gap-1.5 mt-3">
      ${civs}
      <span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">${total}枚</span>
    </div>
    <div class="flex flex-wrap gap-3 mt-6">
      <a href="${escapeHtml(appLink)}"
         class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2">アプリで開く（デッキ構築）</a>
      <button type="button" onclick="shareCard()"
         class="inline-block border border-gray-300 hover:bg-gray-100 text-sm font-medium rounded-lg px-4 py-2">共有</button>
      <a href="${escapeHtml(xIntentUrl(title, url))}" target="_blank" rel="noopener"
         class="inline-block bg-black hover:bg-gray-800 text-white text-sm font-medium rounded-lg px-4 py-2">Xで共有</a>
    </div>
    <div class="mt-6 pt-6 border-t border-gray-200">
      <p class="text-xs font-semibold text-gray-600 mb-2 flex items-center justify-between">
        <span>🛒 このデッキのカードを探す</span>
        <span class="text-[10px] text-gray-400 font-normal">一括検索</span>
      </p>
      <div class="grid grid-cols-2 gap-2">
        <a href="https://jp.mercari.com/search?keyword=${encodeURIComponent('デュエルマスターズ ' + (deckName || 'クラシック08 デッキ'))}"
           target="_blank" rel="noopener noreferrer"
           onclick="if(window.trackEvent)trackEvent('click_buy_deck',{deck_name:'${escapeHtml(deckName || '')}',shop:'mercari'})"
           class="text-center py-2 px-3 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium transition-colors">
          メルカリで探す
        </a>
        <a href="https://www.surugaya.jp/search?category=5&search_word=${encodeURIComponent('デュエルマスターズ ' + (deckName || 'クラシック08 デッキ'))}"
           target="_blank" rel="noopener noreferrer"
           onclick="if(window.trackEvent)trackEvent('click_buy_deck',{deck_name:'${escapeHtml(deckName || '')}',shop:'surugaya'})"
           class="text-center py-2 px-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium transition-colors">
          駿河屋で探す
        </a>
      </div>
    </div>
    <h2 class="text-lg font-semibold mt-8">カードリスト</h2>
    ${cardList}
    <p class="mt-6"><a href="../../" class="text-indigo-600 hover:underline text-sm">デュエルマスターズ クラシック08 データベース トップへ</a></p>
  </main>
  <div id="toast" role="status" aria-live="polite" aria-atomic="true" class="opacity-0 pointer-events-none transition-opacity fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg"></div>
  ${shareScript(title, url)}
${PAGE_FOOTER}
</body>
</html>
`
}

async function main() {
  await mkdir(join(PUBLIC_DIR, 'css'), { recursive: true })
  await writeFile(join(PUBLIC_DIR, 'css/card-page.css'), CARD_PAGE_CSS.trim())

  const cards: CardJson[] = JSON.parse(await readFile(CARDS_FILE, 'utf-8'))
  const recipes: RecipeJson[] = JSON.parse(await readFile(RECIPES_FILE, 'utf-8'))
  const metaDecks: MetaDeckJson[] = JSON.parse(await readFile(META_FILE, 'utf-8'))
  const byId = new Map(cards.map(c => [c.id, c]))

  // --- card pages ---
  let cardPages = 0
  for (const card of cards) {
    const dir = join(PUBLIC_DIR, 'card', card.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), cardPageHtml(card))
    cardPages++
  }

  // --- recipe pages ---
  let recipePages = 0
  const recipeUrls: string[] = []
  for (const recipe of recipes) {
    const dir = join(PUBLIC_DIR, 'recipe', recipe.id)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'index.html'),
      deckPageHtml({
        pathSlug: recipe.id,
        redirectId: recipe.id,
        deckName: recipe.name || '無題のデッキ',
        cards: recipe.cards || [],
        civilizations: recipe.civilizations ?? [],
        byId,
        extraDesc: recipe.archetype ? `アーキタイプ: ${recipe.archetype}。` : undefined,
      })
    )
    recipeUrls.push(`${SITE}/recipe/${recipe.id}/`)
    recipePages++
  }

  // --- meta deck pages ---
  // meta-decks.json には id が無いため meta-{n} を採番する。
  // SPA の ?recipe= は RECIPES（recipes.json）の id しか解決できないため、
  // メタデッキのリダイレクト先は name 一致で対応する recipe があればその id、
  // 無ければトップ（/）へフォールバックする。
  let metaPages = 0
  const metaUrls: string[] = []
  const recipeByName = new Map(recipes.map(r => [r.name, r.id]))
  for (let i = 0; i < metaDecks.length; i++) {
    const deck = metaDecks[i]
    const slug = `meta-${i + 1}`
    const dir = join(PUBLIC_DIR, 'recipe', slug)
    const top = getRepresentativeCard(deck.cards || [], deck.name, byId)
    const matchedRecipeId = recipeByName.get(deck.name)
    // SPA で開ける recipe があればその id、無ければ meta-{n} で直接 SPA のデッキビルダーを開く。
    // recipe/meta-{n}/index.html から SPA トップへは2階層上（相対パス）。
    const appLink = `../../?recipe=${encodeURIComponent(matchedRecipeId || slug)}`
    const url = `${SITE}/recipe/${slug}/`
    const total = deckTotal(deck.cards || [])
    const rarityTag = top && top.rarity ? `【${top.rarity}】` : ''
    const civ = deck.civilization ?? []
    const title = `${deck.name} — メタデッキ | デュエマ クラシック08`
    // OGP description は短く保つ（deck.description は長文なので含めない）。
    const desc = `${top ? `${rarityTag}${top.name}入り。` : ''}${total}枚デッキ。${
      civ.length ? `文明: ${civ.join('・')}。` : ''
    }`
      .replace(/\s+/g, ' ')
      .trim()
    const image = top ? `${IMG_BASE}/${top.id}.jpg` : `${SITE}/ogp.png`
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: deck.name,
      description: desc,
      image,
      url,
    })
    const civs = civBadges(civ)
    const cardList = deckCardListHtml(deck.cards || [], byId)
    const descBlock = deck.description
      ? `<p class="mt-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">${escapeHtml(deck.description)}</p>`
      : ''
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <link rel="stylesheet" href="../../css/tailwind.css">
  <style>${PAGE_STYLE}</style>
  <script type="application/ld+json">
${jsonLdEscape(jsonLd)}
  </script>
  <script>
    if (!/bot|googlebot|crawler|spider|robot|crawling|facebookexternalhit|slurp|flipboard/i.test(navigator.userAgent)) {
      window.location.replace('${escapeHtml(appLink)}');
    }
  </script>
</head>
<body class="bg-gray-50 text-gray-900">
  <main class="max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold">${escapeHtml(deck.name)}</h1>
    <div class="flex flex-wrap items-center gap-1.5 mt-3">
      ${civs}
      <span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">${total}枚</span>
      <span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">メタデッキ</span>
    </div>
    ${descBlock}
    <div class="flex flex-wrap gap-3 mt-6">
      <a href="${escapeHtml(appLink)}"
         class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2">アプリで開く（デッキ構築）</a>
      <button type="button" onclick="shareCard()"
         class="inline-block border border-gray-300 hover:bg-gray-100 text-sm font-medium rounded-lg px-4 py-2">共有</button>
      <a href="${escapeHtml(xIntentUrl(title, url))}" target="_blank" rel="noopener"
         class="inline-block bg-black hover:bg-gray-800 text-white text-sm font-medium rounded-lg px-4 py-2">Xで共有</a>
    </div>
    <div class="mt-6 pt-6 border-t border-gray-200">
      <p class="text-xs font-semibold text-gray-600 mb-2 flex items-center justify-between">
        <span>🛒 このメタデッキのカードを探す</span>
        <span class="text-[10px] text-gray-400 font-normal">一括検索</span>
      </p>
      <div class="grid grid-cols-2 gap-2">
        <a href="https://jp.mercari.com/search?keyword=${encodeURIComponent('デュエルマスターズ ' + deck.name)}"
           target="_blank" rel="noopener noreferrer"
           onclick="if(window.trackEvent)trackEvent('click_buy_deck',{deck_name:'${escapeHtml(deck.name)}',shop:'mercari',is_meta:true})"
           class="text-center py-2 px-3 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium transition-colors">
          メルカリで探す
        </a>
        <a href="https://www.surugaya.jp/search?category=5&search_word=${encodeURIComponent('デュエルマスターズ ' + deck.name)}"
           target="_blank" rel="noopener noreferrer"
           onclick="if(window.trackEvent)trackEvent('click_buy_deck',{deck_name:'${escapeHtml(deck.name)}',shop:'surugaya',is_meta:true})"
           class="text-center py-2 px-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium transition-colors">
          駿河屋で探す
        </a>
      </div>
    </div>
    <h2 class="text-lg font-semibold mt-8">カードリスト</h2>
    ${cardList}
    <p class="mt-6"><a href="../../" class="text-indigo-600 hover:underline text-sm">デュエルマスターズ クラシック08 データベース トップへ</a></p>
  </main>
  <div id="toast" role="status" aria-live="polite" aria-atomic="true" class="opacity-0 pointer-events-none transition-opacity fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg"></div>
  ${shareScript(title, url)}
${PAGE_FOOTER}
</body>
</html>
`
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), html)
    metaUrls.push(url)
    metaPages++
  }

  // robots.txt
  const robots = `User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`
  await writeFile(join(PUBLIC_DIR, 'robots.txt'), robots)

  // sitemap.xml（card + recipe + meta を一括生成、上書き競合を避ける）
  const today = new Date().toISOString().slice(0, 10)
  const urls = [
    `  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>`,
    ...cards.map(
      c => `  <url><loc>${escapeXml(`${SITE}/card/${c.id}/`)}</loc><lastmod>${today}</lastmod></url>`
    ),
    ...recipeUrls.map(
      u => `  <url><loc>${escapeXml(u)}</loc><lastmod>${today}</lastmod></url>`
    ),
    ...metaUrls.map(
      u => `  <url><loc>${escapeXml(u)}</loc><lastmod>${today}</lastmod></url>`
    ),
  ]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
  await writeFile(join(PUBLIC_DIR, 'sitemap.xml'), sitemap)

  console.log(`Card pages   : ${cardPages}`)
  console.log(`Recipe pages : ${recipePages}`)
  console.log(`Meta pages   : ${metaPages}`)
  console.log(`robots.txt   : ${join(PUBLIC_DIR, 'robots.txt')}`)
  console.log(`sitemap.xml  : ${join(PUBLIC_DIR, 'sitemap.xml')} (${urls.length} urls)`)
}

main().catch(e => { console.error(e); process.exit(1) })
