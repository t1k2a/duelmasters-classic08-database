import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { fetchCampaignPerformance, type CampaignPerformance } from './ga4-campaign-report.js';

// .env ファイルを自動ロード（Node 20.0 等の環境でも安全に動作）
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {}
  }
}
loadEnv();


// scripts/ga4-analytics.ts
// Google Analytics 4 (Data API) から実測値を取得・集計し、
// 観測値と未実行の改善仮説を区別したレポート（docs/marketing/ga4-action-strategy.md）を出力する。
//
// 使い方:
//   npx tsx scripts/ga4-analytics.ts          # 実測モード (要 GA4_PROPERTY_ID, GOOGLE_APPLICATION_CREDENTIALS)
//   npx tsx scripts/ga4-analytics.ts --mock   # モック/テストモード (CI・検証用)

interface BuyClickCard {
  id: string;
  name: string;
  clicks: number;
  share: number;
}

interface ShopShare {
  shop: string;
  clicks: number;
  percentage: number;
}

export interface GrowthPeriodMetrics {
  activeUsers: number;
  organicUsers: number;
  guideEntrances: number;
  viewCardDetail: number;
  copyDeck: number;
  deckComplete: number;
  shareDeck: number;
  pwaInstall: number;
  contentCtaClick: number;
}

export interface GrowthPeriodComparison {
  last7Days: GrowthPeriodMetrics;
  last28Days: GrowthPeriodMetrics;
}

interface NormalizedAnalyticsRow {
  dimensions: string[];
  metrics: string[];
}

interface GrowthPeriodInput {
  activeUsers: number;
  channelRows: NormalizedAnalyticsRow[];
  eventRows: NormalizedAnalyticsRow[];
  guideRows: NormalizedAnalyticsRow[];
}

interface AnalyticsSummary {
  period: string;
  totalPv: number;
  totalUsers: number;
  avgEngagementTime: string;
  trafficSources: { source: string; users: number; percentage: number }[];
  popularCards: { id: string; name: string; pv: number; share: number }[];
  buyClicksTotal: number;
  buyClicksCards: BuyClickCard[];
  shopShares: ShopShare[];
  deckShareEvents: number;
  deckBuyEvents: number;
  growth: GrowthPeriodComparison;
  isMock?: boolean;
  campaignPerformance?: CampaignPerformance[];
}

const growthEventFields = {
  view_card_detail: 'viewCardDetail',
  copy_deck: 'copyDeck',
  deck_complete: 'deckComplete',
  share_deck: 'shareDeck',
  pwa_install: 'pwaInstall',
  content_cta_click: 'contentCtaClick',
} as const;

const comparisonMetrics: { label: string; key: keyof GrowthPeriodMetrics }[] = [
  { label: 'アクティブユーザー', key: 'activeUsers' },
  { label: 'オーガニック検索ユーザー', key: 'organicUsers' },
  { label: 'ガイド入口セッション', key: 'guideEntrances' },
  { label: 'カード詳細閲覧', key: 'viewCardDetail' },
  { label: 'ガイドCTAクリック', key: 'contentCtaClick' },
  { label: 'デッキコピー', key: 'copyDeck' },
  { label: '40枚完成', key: 'deckComplete' },
  { label: 'デッキ共有', key: 'shareDeck' },
  { label: 'PWAインストール', key: 'pwaInstall' },
];

function finiteNonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function weeklyPace(value7Days: number, value28Days: number): string {
  const weeklyAverage = value28Days / 4;
  if (weeklyAverage <= 0) return value7Days > 0 ? '新規' : '比較不可';
  const change = ((value7Days - weeklyAverage) / weeklyAverage) * 100;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

function isGuidePath(pagePath: string): boolean {
  return /\/(?:guide|deck-guide|guides)(?:\/|$)/.test(pagePath);
}

/**
 * Normalize a GA4 dimension before placing it in a Markdown report.
 *
 * Dimension values originate outside this repository.  Keeping each value on
 * one escaped line prevents it from closing the report's code fence or
 * changing the surrounding Markdown structure in GITHUB_STEP_SUMMARY.
 */
export function escapeMarkdownReportText(value: string): string {
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]<>\(\)#\+\-!|])/g, '\\$1');
}

export function aggregateGrowthPeriod(input: GrowthPeriodInput): GrowthPeriodMetrics {
  const metrics: GrowthPeriodMetrics = {
    activeUsers: finiteNonNegative(input.activeUsers),
    organicUsers: 0,
    guideEntrances: 0,
    viewCardDetail: 0,
    copyDeck: 0,
    deckComplete: 0,
    shareDeck: 0,
    pwaInstall: 0,
    contentCtaClick: 0,
  };

  for (const row of input.channelRows) {
    if (row.dimensions[0] === 'Organic Search') {
      metrics.organicUsers += finiteNonNegative(row.metrics[0]);
    }
  }

  for (const row of input.eventRows) {
    const field = growthEventFields[row.dimensions[0] as keyof typeof growthEventFields];
    if (field) metrics[field] += finiteNonNegative(row.metrics[0]);
  }

  for (const row of input.guideRows) {
    if (isGuidePath(row.dimensions[0] || '')) {
      metrics.guideEntrances += finiteNonNegative(row.metrics[0]);
    }
  }

  return metrics;
}

export function renderGrowthFunnel(metrics: GrowthPeriodMetrics): string {
  return `### 直近期間の成長ファネル（集計比較）

同一ユーザーの段階遷移を計測したファネルではありません。ガイド入口はセッション数、イベントは延べ回数です。アクティブユーザー比はCVRではなく、100%を超える場合があります。

| 段階 | 件数 | アクティブユーザー比 |
| :--- | ---: | ---: |
| アクティブユーザー | ${metrics.activeUsers.toLocaleString()} | ${percentage(metrics.activeUsers, metrics.activeUsers)} |
| オーガニック検索 | ${metrics.organicUsers.toLocaleString()} | ${percentage(metrics.organicUsers, metrics.activeUsers)} |
| ガイド入口 | ${metrics.guideEntrances.toLocaleString()} | ${percentage(metrics.guideEntrances, metrics.activeUsers)} |
| \`view_card_detail\` | ${metrics.viewCardDetail.toLocaleString()} | ${percentage(metrics.viewCardDetail, metrics.activeUsers)} |
| \`content_cta_click\` | ${metrics.contentCtaClick.toLocaleString()} | ${percentage(metrics.contentCtaClick, metrics.activeUsers)} |
| \`copy_deck\` | ${metrics.copyDeck.toLocaleString()} | ${percentage(metrics.copyDeck, metrics.activeUsers)} |
| \`deck_complete\` | ${metrics.deckComplete.toLocaleString()} | ${percentage(metrics.deckComplete, metrics.activeUsers)} |
| \`share_deck\` | ${metrics.shareDeck.toLocaleString()} | ${percentage(metrics.shareDeck, metrics.activeUsers)} |
| \`pwa_install\` | ${metrics.pwaInstall.toLocaleString()} | ${percentage(metrics.pwaInstall, metrics.activeUsers)} |`;
}

export function renderGrowthPeriodComparison(comparison: GrowthPeriodComparison): string {
  const rows = comparisonMetrics.map(({ label, key }) => {
    const current = comparison.last7Days[key];
    const total28Days = comparison.last28Days[key];
    const weeklyAverage = total28Days / 4;
    return `| ${label} | ${current.toLocaleString()} | ${total28Days.toLocaleString()} | ${weeklyAverage.toLocaleString(undefined, { maximumFractionDigits: 1 })} | ${weeklyPace(current, total28Days)} |`;
  });

  return `## オーガニック成長（7日 / 28日）

昨日までの直近7日を、昨日までの直近28日の週平均（28日値 ÷ 4）と比較します。両期間は重複し、前週比ではありません。アクティブユーザーなどの期間内ユニーク数は日数で割っても週のユニーク数の平均にはならないため、参考値です。

| 指標 | 直近7日 | 直近28日 | 28日週平均 | 週次ペース差 |
| :--- | ---: | ---: | ---: | ---: |
${rows.join('\n')}

${renderGrowthFunnel(comparison.last7Days)}`;
}

function getJstDateString(): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(d).replace(/\//g, '-');
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}分${s}秒`;
}

export function generateActionStrategy(data: AnalyticsSummary): string {
  const topSource = [...data.trafficSources].sort((a, b) => b.users - a.users)[0];
  const topPvCard = [...data.popularCards].sort((a, b) => b.pv - a.pv)[0];
  const totalBuyActions = data.buyClicksTotal + data.deckBuyEvents;
  const perUser = (count: number) => data.totalUsers > 0
    ? `${(count / data.totalUsers).toFixed(3)} 回/人` : '算出不可（分母0）';
  const text = escapeMarkdownReportText;
  const modeBadge = data.isMock ? '【⚠️ シミュレーション / テストデータ】' : '【本番実測データ】';
  const cardBreakdown = data.isMock && data.buyClicksCards.length
    ? `| カード名 | クリック数 | 内訳比 |\n| :--- | ---: | ---: |\n${data.buyClicksCards.slice(0, 5).map(c => `| ${text(c.name)} | ${c.clicks.toLocaleString()} | ${c.share}% |`).join('\n')}`
    : '未取得：カード別クリックのディメンションを取得していません。カードPVからクリック数を推計しません。';
  const shopBreakdown = data.isMock && data.shopShares.length
    ? `| 店舗名 | クリック数 | 内訳比 |\n| :--- | ---: | ---: |\n${data.shopShares.map(s => `| ${text(s.shop)} | ${s.clicks.toLocaleString()} | ${s.percentage}% |`).join('\n')}`
    : '未取得：店舗別クリックのディメンションを取得していません。固定割合による配分は行いません。';

  return `# 📊 GA4 観測レポートと改善仮説 ${modeBadge}

**集計期間**: ${text(data.period)}

**生成日時**: ${getJstDateString()} (JST)

**担当**: CEO & CMO Growth Team

${data.isMock ? 'このレポートはテストデータです。実績の判断には使用できません。' : 'GA4 Data API の取得結果です。0件は返却結果に該当イベントがない場合を含み、計測の正常性を保証しません。'}

## 1. 観測値サマリー

| 指標 | 値 | 定義 |
| :--- | ---: | :--- |
| ページビュー | ${data.totalPv.toLocaleString()} | screenPageViews |
| アクティブユーザー | ${data.totalUsers.toLocaleString()} | activeUsers |
| ユーザーあたり平均エンゲージメント時間 | ${text(data.avgEngagementTime)} | userEngagementDuration / activeUsers |
| カード購入リンククリック | ${data.buyClicksTotal.toLocaleString()} | click_buy_card の eventCount |
| デッキ購入リンククリック | ${data.deckBuyEvents.toLocaleString()} | click_buy_deck の eventCount |
| 購入リンククリックのユーザーあたりイベント比 | ${perUser(totalBuyActions)} | カードとデッキの eventCount 合計 / activeUsers |
| デッキ共有イベント | ${data.deckShareEvents.toLocaleString()} | share_deck の eventCount |
| デッキ共有のユーザーあたりイベント比 | ${perUser(data.deckShareEvents)} | eventCount / activeUsers |

イベント比は同じユーザーの複数回操作を含みます。CVRや共有ユーザー率ではありません。購入リンククリックは購入完了・売上を示しません。

${renderGrowthPeriodComparison(data.growth)}

## 投稿別流入（source / medium / campaign / content）

完了した直近30日間。セッション帰属の4項目で集計し、content（utm_content）で投稿を区別します。イベント数は延べ回数で、購入完了数・CVRではありません。未設定値や集約行は投稿を特定できません。

| source | medium | campaign | content | sessions | copy_deck | deck_complete | share_deck | click_buy_card | click_buy_deck |
| :--- | :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
${data.campaignPerformance?.map(row => `| ${[row.source, row.medium, row.campaign, row.content].map(text).join(' | ')} | ${[row.sessions, row.copyDeck, row.deckComplete, row.shareDeck, row.buyCard, row.buyDeck].join(' | ')} |`).join('\n') || (data.campaignPerformance ? '| 返却行なし | — | — | — | — | — | — | — | — | — |' : '| 未取得 | — | — | — | — | — | — | — | — | — |')}

## 2. 流入元

取得した上位10流入元の activeUsers 行合計を分母とする割合です。同じユーザーが複数の流入元に含まれる場合があり、サイト全体の排他的なシェアではありません。

| 流入元 | アクティブユーザー | 取得行内の割合 |
| :--- | ---: | ---: |
${data.trafficSources.map(s => `| ${text(s.source)} | ${s.users.toLocaleString()} | ${s.percentage}% |`).join('\n') || '| データなし | — | — |'}

${topSource ? `取得行内でユーザー数が最多の流入元: ${text(topSource.source)}。流入の増減や理由はこの集計だけでは判断できません。` : '流入元データなし。Direct などの値による補完はしていません。'}

## 3. カード閲覧とクリック内訳

### カード閲覧

取得したPV上位50ページ中のカードページです。全カードの順位・シェアを保証しません。

| カード名 | PV |
| :--- | ---: |
${data.popularCards.map(c => `| ${text(c.name)} | ${c.pv.toLocaleString()} |`).join('\n') || '| データなし | — |'}

### カード別購入リンククリック

${cardBreakdown}

### 店舗別購入リンククリック

${shopBreakdown}

## 4. 改善仮説（未実行）

以下は観測から検討する候補です。このスクリプトは投稿・キュー投入・サイト変更を実行しません。購買動機や施策効果は未検証です。

- ${topPvCard ? `観測: 取得カード行内で《${text(topPvCard.name)}》のPVが最多（${topPvCard.pv.toLocaleString()}）。仮説: 関連デッキ解説への導線が回遊に役立つ可能性があります。検証: 対象ページのCTAイベントを定義し、変更前後で比較する。` : 'カード閲覧データがないため、特定カードを対象とする施策は保留し、計測状態を確認する。'}
- 観測: デッキ購入リンククリック ${data.deckBuyEvents.toLocaleString()} 回、共有 ${data.deckShareEvents.toLocaleString()} 回。仮説: デッキ完成後の導線を改善できる可能性があります。検証: 計測状態と操作の到達経路を確認し、同一期間の比較を設計する。0件だけで導線の不調とは判断しない。
- 観測: 直近7日のオーガニック検索ユーザー ${data.growth.last7Days.organicUsers.toLocaleString()} 人。仮説: ガイドへの入口を改善できる可能性があります。検証: 検索流入の対象ページとガイド入口セッションを確認し、比較期間を定める。

## 5. 取得範囲と制約

生成元: scripts/ga4-analytics.ts。期間はGA4プロパティのタイムゾーンに基づきます。直近日の処理遅延や計測設定により値が変わる場合があります。カード別・店舗別のクリック計測状態とカスタムディメンション登録は未確認です。新規ユーザー率・購入完了・売上・購買動機は取得していません。
`;
}

interface AnalyticsRowLike {
  dimensionValues?: ({ value?: string | null } | null)[] | null;
  metricValues?: ({ value?: string | null } | null)[] | null;
}

function normalizeRows(rows: AnalyticsRowLike[] | null | undefined): NormalizedAnalyticsRow[] {
  return (rows || []).map(row => ({
    dimensions: (row.dimensionValues || []).map(value => value?.value || ''),
    metrics: (row.metricValues || []).map(value => value?.value || '0'),
  }));
}

export async function fetchGrowthPeriod(
  client: Pick<BetaAnalyticsDataClient, 'runReport'>,
  propertyId: string,
  startDate: '7daysAgo' | '28daysAgo',
): Promise<GrowthPeriodMetrics> {
  const dateRanges = [{ startDate, endDate: 'yesterday' }];
  const property = `properties/${propertyId}`;

  const [overviewResult, channelResult, eventResult, guideResult] = await Promise.all([
    client.runReport({
      property,
      dateRanges,
      metrics: [{ name: 'activeUsers' }],
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'activeUsers' }],
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: Object.keys(growthEventFields) },
        },
      },
    }),
    client.runReport({
      property,
      dateRanges,
      // landingPage is the first pageview in a session; pagePath also counts later visits.
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: {
        filter: {
          fieldName: 'landingPage',
          stringFilter: {
            matchType: 'FULL_REGEXP',
            value: '^.*/(guide|deck-guide|guides)(/.*)?$',
          },
        },
      },
      limit: 1000,
    }),
  ]);

  const overviewRows = normalizeRows(overviewResult[0].rows as AnalyticsRowLike[] | null | undefined);
  return aggregateGrowthPeriod({
    activeUsers: finiteNonNegative(overviewRows[0]?.metrics[0]),
    channelRows: normalizeRows(channelResult[0].rows as AnalyticsRowLike[] | null | undefined),
    eventRows: normalizeRows(eventResult[0].rows as AnalyticsRowLike[] | null | undefined),
    guideRows: normalizeRows(guideResult[0].rows as AnalyticsRowLike[] | null | undefined),
  });
}

// GA4 Data API から実測値を取得して集計
export async function fetchRealAnalytics(
  propertyId: string,
  client: Pick<BetaAnalyticsDataClient, 'runReport'> = new BetaAnalyticsDataClient(),
): Promise<AnalyticsSummary> {

  // 1. 全体サマリーの取得
  const [overviewRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'userEngagementDuration' },
    ],
  });

  const totalPv = Number(overviewRes.rows?.[0]?.metricValues?.[0]?.value || 0);
  const totalUsers = Number(overviewRes.rows?.[0]?.metricValues?.[1]?.value || 0);
  const totalDuration = Number(overviewRes.rows?.[0]?.metricValues?.[2]?.value || 0);
  const avgDurationSeconds = totalUsers > 0 ? totalDuration / totalUsers : 0;

  // 2. 流入元の取得
  const [sourceRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: 10,
  });

  const sourcesTotal = sourceRes.rows?.reduce((sum, row) => sum + Number(row.metricValues?.[0]?.value || 0), 0) || 1;
  const trafficSources = (sourceRes.rows || []).map(row => {
    const src = row.dimensionValues?.[0]?.value || '(not set)';
    const users = Number(row.metricValues?.[0]?.value || 0);
    return {
      source: src === '(direct)' ? 'Direct / Bookmarks' : src,
      users,
      percentage: Math.round((users / sourcesTotal) * 100),
    };
  });

  // 3. 人気カードPVの取得（/card/dmXX-XXX ページパス）
  const [pagesRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 50,
  });

  // cards.json を読み込んでカード名解決
  const cardsJsonPath = path.join(process.cwd(), 'public/cards.json');
  let cardsMap = new Map<string, string>();
  try {
    const cards = JSON.parse(fs.readFileSync(cardsJsonPath, 'utf-8'));
    cardsMap = new Map(cards.map((c: any) => [c.id, c.name]));
  } catch {}

  const popularCards: { id: string; name: string; pv: number; share: number }[] = [];
  let cardPvTotal = 0;

  for (const row of pagesRes.rows || []) {
    const p = row.dimensionValues?.[0]?.value || '';
    const match = p.match(/\/card\/([^/]+)/);
    if (match) {
      const cardId = match[1];
      const cardName = cardsMap.get(cardId) || cardId;
      const pv = Number(row.metricValues?.[0]?.value || 0);
      cardPvTotal += pv;
      popularCards.push({ id: cardId, name: cardName, pv, share: 0 });
    }
  }

  popularCards.forEach(c => {
    c.share = cardPvTotal > 0 ? Number(((c.pv / cardPvTotal) * 100).toFixed(1)) : 0;
  });

  // 4. イベント集計 (share_deck, click_buy_card, click_buy_deck)
  const [eventRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
  });

  let deckShareEvents = 0;
  let buyClicksTotal = 0;
  let deckBuyEvents = 0;

  for (const row of eventRes.rows || []) {
    const name = row.dimensionValues?.[0]?.value;
    const count = Number(row.metricValues?.[0]?.value || 0);
    if (name === 'share_deck') deckShareEvents += count;
    if (name === 'click_buy_card') buyClicksTotal += count;
    if (name === 'click_buy_deck') deckBuyEvents += count;
  }

  // eventName 集計ではカード・店舗の内訳は取得できない。
  const buyClicksCards: BuyClickCard[] = [];
  const shopShares: ShopShare[] = [];

  const [last7Days, last28Days] = await Promise.all([
    fetchGrowthPeriod(client, propertyId, '7daysAgo'),
    fetchGrowthPeriod(client, propertyId, '28daysAgo'),
  ]);

  return {
    period: '完了した直近30日間（30daysAgo〜yesterday、GA4プロパティのタイムゾーン）',
    totalPv,
    totalUsers,
    avgEngagementTime: formatDuration(avgDurationSeconds),
    trafficSources,
    popularCards: popularCards.slice(0, 10),
    buyClicksTotal,
    buyClicksCards,
    shopShares,
    deckShareEvents,
    deckBuyEvents,
    growth: { last7Days, last28Days },
    campaignPerformance: await fetchCampaignPerformance(client, propertyId),
    isMock: false,
  };
}

// メイン実行
async function main() {
  const isMock = process.argv.includes('--mock') || process.env.GA4_MOCK === 'true';
  const propertyId = process.env.GA4_PROPERTY_ID;

  let summary: AnalyticsSummary;

  if (isMock) {
    console.log('Running GA4 analytics in --mock mode.');
    summary = {
      period: '直近30日間 (シミュレーション)',
      totalPv: 48520,
      totalUsers: 14230,
      avgEngagementTime: '2分48秒',
      trafficSources: [
        { source: 'X / Twitter', users: 7400, percentage: 52 },
        { source: 'Google Search (SEO)', users: 3980, percentage: 28 },
        { source: 'Direct / Bookmarks', users: 1850, percentage: 13 },
        { source: 'dmwiki / External Links', users: 1000, percentage: 7 },
      ],
      popularCards: [
        { id: 'dm01-061', name: 'ボルメテウス・ホワイト・ドラゴン', pv: 4820, share: 10.0 },
        { id: 'dm01-025', name: 'アクア・ハルカス', pv: 3610, share: 7.4 },
        { id: 'dm01-040', name: 'デーモン・ハンド', pv: 3240, share: 6.7 },
        { id: 'dm01-081', name: '青銅の鎧', pv: 2980, share: 6.1 },
        { id: 'dm01-006', name: '予言者クルト', pv: 2540, share: 5.2 },
        { id: 'dm01-070', name: 'クリムゾン・ワイバーン', pv: 2110, share: 4.3 },
      ],
      buyClicksTotal: 1280,
      buyClicksCards: [
        { id: 'dm01-061', name: 'ボルメテウス・ホワイト・ドラゴン', clicks: 320, share: 25.0 },
        { id: 'dm01-025', name: 'アクア・ハルカス', clicks: 190, share: 14.8 },
        { id: 'dm01-040', name: 'デーモン・ハンド', clicks: 155, share: 12.1 },
        { id: 'dm01-081', name: '青銅の鎧', clicks: 130, share: 10.2 },
        { id: 'dm01-006', name: '予言者クルト', clicks: 95, share: 7.4 },
      ],
      shopShares: [
        { shop: '駿河屋 (Surugaya)', clicks: 538, percentage: 42 },
        { shop: 'メルカリ (Mercari)', clicks: 486, percentage: 38 },
        { shop: 'カーナベル (Ka-Nabell)', clicks: 256, percentage: 20 },
      ],
      deckShareEvents: 740,
      deckBuyEvents: 185,
      growth: {
        last7Days: {
          activeUsers: 47,
          organicUsers: 0,
          guideEntrances: 0,
          viewCardDetail: 0,
          copyDeck: 0,
          deckComplete: 0,
          shareDeck: 0,
          pwaInstall: 0,
          contentCtaClick: 0,
        },
        last28Days: {
          activeUsers: 47,
          organicUsers: 0,
          guideEntrances: 0,
          viewCardDetail: 0,
          copyDeck: 0,
          deckComplete: 0,
          shareDeck: 0,
          pwaInstall: 0,
          contentCtaClick: 0,
        },
      },
      isMock: true,
    };
  } else {
    if (!propertyId) {
      console.error('Error: GA4_PROPERTY_ID 環境変数が未設定です。本番実測を行うには GA4_PROPERTY_ID と GOOGLE_APPLICATION_CREDENTIALS を設定してください。');
      console.error('テスト実行を行う場合は `npx tsx scripts/ga4-analytics.ts --mock` を使用してください。');
      process.exit(1);
    }

    try {
      summary = await fetchRealAnalytics(propertyId);
      console.log('Successfully fetched and parsed real metrics from GA4 Data API.');
    } catch (err) {
      console.error('Failed to fetch/aggregate GA4 Data API metrics:', err);
      process.exit(1);
    }
  }

  const report = generateActionStrategy(summary);
  const outPath = path.join(process.cwd(), 'docs/marketing/ga4-action-strategy.md');
  fs.writeFileSync(outPath, report, 'utf-8');
  console.log(`GA4 Analytics & Strategy Report generated at: ${outPath}`);
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPoint) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
