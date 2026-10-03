import assert from 'node:assert/strict';
import test from 'node:test';
import type { BetaAnalyticsDataClient } from '@google-analytics/data';
import {
  aggregateGrowthPeriod,
  escapeMarkdownReportText,
  fetchGrowthPeriod,
  fetchRealAnalytics,
  generateActionStrategy,
  renderGrowthFunnel,
  renderGrowthPeriodComparison,
} from '../../scripts/ga4-analytics.js';

test('GA4流入元をMarkdown構文として解釈されない一行の値に変換する', () => {
  const escaped = escapeMarkdownReportText('bad\n```\n[link](https://example.com)');
  assert.doesNotMatch(escaped, /[\r\n]/);
  assert.doesNotMatch(escaped, /(?<!\\)```/);
  assert.match(escaped, /\\\[link\\\]/);

  const report = generateActionStrategy({
    period: 'test', totalPv: 0, totalUsers: 0, avgEngagementTime: '0分0秒',
    trafficSources: [{ source: 'bad\n```\n[link](https://example.com)', users: 1, percentage: 100 }],
    popularCards: [], buyClicksTotal: 0, buyClicksCards: [], shopShares: [], deckShareEvents: 0, deckBuyEvents: 0,
    growth: {
      last7Days: { activeUsers: 0, organicUsers: 0, guideEntrances: 0, viewCardDetail: 0, copyDeck: 0, deckComplete: 0, shareDeck: 0, pwaInstall: 0, contentCtaClick: 0 },
      last28Days: { activeUsers: 0, organicUsers: 0, guideEntrances: 0, viewCardDetail: 0, copyDeck: 0, deckComplete: 0, shareDeck: 0, pwaInstall: 0, contentCtaClick: 0 },
    },
  });
  assert.doesNotMatch(report, /bad\n/);
  assert.doesNotMatch(report, /\n```\n\[link\]/);
});

test('ガイド入口は閲覧ページでなくセッションの最初のページで集計する', async () => {
  type Request = {
    dimensions?: { name: string }[];
    metrics?: { name: string }[];
    dimensionFilter?: { filter: { fieldName: string } };
  };
  const requests: Request[] = [];
  const client = {
    async runReport(request: Request) {
      requests.push(request);
      return [{ rows: [] }];
    },
  } as unknown as BetaAnalyticsDataClient;

  for (const period of ['7daysAgo', '28daysAgo'] as const) {
    await fetchGrowthPeriod(client, 'test-property', period);
  }

  const entranceRequests = requests.filter(request => request.metrics?.[0]?.name === 'sessions');
  assert.equal(entranceRequests.length, 2);
  for (const request of entranceRequests) {
    assert.deepEqual(request.dimensions, [{ name: 'landingPage' }]);
    assert.equal(request.dimensionFilter?.filter.fieldName, 'landingPage');
  }
});

test('成長ファネルをゼロ除算せず出力する', () => {
  const report = renderGrowthFunnel({
    activeUsers: 47,
    organicUsers: 0,
    guideEntrances: 0,
    viewCardDetail: 0,
    copyDeck: 0,
    deckComplete: 0,
    shareDeck: 0,
    pwaInstall: 0,
    contentCtaClick: 0,
  });

  assert.match(report, /オーガニック検索/);
  assert.match(report, /ガイド入口/);
  assert.match(report, /content_cta_click/);
  assert.doesNotMatch(report, /NaN|Infinity/);
});

test('GA4の行からOrganic Search、イベント、ガイド入口を集計する', () => {
  const metrics = aggregateGrowthPeriod({
    activeUsers: 20,
    channelRows: [
      { dimensions: ['Organic Search'], metrics: ['7'] },
      { dimensions: ['Direct'], metrics: ['13'] },
    ],
    eventRows: [
      { dimensions: ['view_card_detail'], metrics: ['12'] },
      { dimensions: ['copy_deck'], metrics: ['5'] },
      { dimensions: ['deck_complete'], metrics: ['3'] },
      { dimensions: ['share_deck'], metrics: ['2'] },
      { dimensions: ['pwa_install'], metrics: ['1'] },
      { dimensions: ['content_cta_click'], metrics: ['4'] },
      { dimensions: ['click_buy_card'], metrics: ['99'] },
    ],
    guideRows: [
      { dimensions: ['/guide/classic08-getting-started/'], metrics: ['4'] },
      { dimensions: ['/deck-guide/black-green-rush/'], metrics: ['3'] },
      { dimensions: ['/card/dm01-001/'], metrics: ['100'] },
    ],
  });

  assert.deepEqual(metrics, {
    activeUsers: 20,
    organicUsers: 7,
    guideEntrances: 7,
    viewCardDetail: 12,
    copyDeck: 5,
    deckComplete: 3,
    shareDeck: 2,
    pwaInstall: 1,
    contentCtaClick: 4,
  });
});

test('7日と28日の週平均比較はゼロ値でも有限値だけを出力する', () => {
  const zero = {
    activeUsers: 0,
    organicUsers: 0,
    guideEntrances: 0,
    viewCardDetail: 0,
    copyDeck: 0,
    deckComplete: 0,
    shareDeck: 0,
    pwaInstall: 0,
    contentCtaClick: 0,
  };

  const report = renderGrowthPeriodComparison({ last7Days: zero, last28Days: zero });

  assert.match(report, /直近7日/);
  assert.match(report, /28日週平均/);
  assert.match(report, /比較不可/);
  assert.match(report, /\| アクティブユーザー \| 0 \| 0\.0% \|/);
  assert.doesNotMatch(report, /NaN|Infinity/);
});

function analyticsClient(empty = false) {
  type Request = {
    dateRanges?: { startDate: string; endDate: string }[];
    dimensions?: { name: string }[];
    metrics?: { name: string }[];
  };
  const requests: Request[] = [];
  const row = (dimension: string, metrics: string[]) => ({
    dimensionValues: [{ value: dimension }], metricValues: metrics.map(value => ({ value })),
  });
  const client = {
    async runReport(request: Request) {
      requests.push(request);
      if (empty) return [{ rows: [] }];
      const dimension = request.dimensions?.[0]?.name;
      if (dimension === 'pagePath') return [{ rows: [row('/card/unknown-card/', ['1000'])] }];
      if (dimension === 'eventName') return [{ rows: [row('click_buy_card', ['7']), row('click_buy_deck', ['3']), row('share_deck', ['5'])] }];
      if (dimension === 'sessionSource') return [{ rows: [row('source', ['2'])] }];
      if (dimension) return [{ rows: [] }];
      return [{ rows: [row('', request.metrics?.length === 3 ? ['1000', '2', '120'] : ['2'])] }];
    },
  } as unknown as BetaAnalyticsDataClient;
  return { client, requests };
}

test('実測API結果からカードPV・固定店舗比によるクリック推計を生成しない', async () => {
  const { client, requests } = analyticsClient();
  const data = await fetchRealAnalytics('test-property', client);
  assert.equal(data.totalPv, 1000);
  assert.equal(data.buyClicksTotal, 7);
  assert.equal(data.deckBuyEvents, 3);
  assert.equal(data.popularCards[0].pv, 1000);
  assert.deepEqual(data.buyClicksCards, []);
  assert.deepEqual(data.shopShares, []);
  assert.equal(data.isMock, false);
  assert.ok(requests.every(request => request.dateRanges?.[0]?.endDate === 'yesterday'));
  assert.deepEqual(new Set(requests.map(request => request.dateRanges?.[0]?.startDate)), new Set(['30daysAgo', '7daysAgo', '28daysAgo']));
  const report = generateActionStrategy(data);
  assert.match(report, /本番実測データ/);
  assert.match(report, /未取得：カード別クリック/);
  assert.match(report, /未取得：店舗別クリック/);
  assert.match(report, /5\.000 回\/人/);
  assert.match(report, /CVRや共有ユーザー率ではありません/);
  assert.match(report, /購入完了・売上を示しません/);
  assert.match(report, /改善仮説（未実行）/);
  assert.doesNotMatch(report, /新規流入が約|自律実行中|主軸|目標 10|目標 8|インデックス進展/);
});

test('空の実測結果を特定カード・Direct流入で補完しない', async () => {
  const { client } = analyticsClient(true);
  const data = await fetchRealAnalytics('test-property', client);
  assert.deepEqual(data.trafficSources, []);
  assert.deepEqual(data.popularCards, []);
  assert.equal(data.buyClicksTotal, 0);
  const report = generateActionStrategy(data);
  assert.match(report, /流入元データなし/);
  assert.match(report, /算出不可（分母0）/);
  assert.match(report, /未取得：カード別クリック/);
  assert.doesNotMatch(report, /ボルメテウス|Direct \/ Bookmarks|NaN|Infinity/);
});

test('モックを明示しカード名・店舗名・期間のMarkdown構造をエスケープする', async () => {
  const { client } = analyticsClient(true);
  const data = await fetchRealAnalytics('test-property', client);
  const external = 'unsafe|cell\n# heading [link](url)<script>';
  const report = generateActionStrategy({
    ...data, isMock: true, period: external,
    popularCards: [{ id: 'test', name: external, pv: 1, share: 100 }],
    buyClicksCards: [{ id: 'test', name: external, clicks: 1, share: 100 }],
    shopShares: [{ shop: external, clicks: 1, percentage: 100 }],
  });
  assert.match(report, /シミュレーション \/ テストデータ/);
  assert.match(report, /実績の判断には使用できません/);
  assert.doesNotMatch(report, /unsafe\|cell|\n# heading|<script>/);
  assert.ok(report.includes(escapeMarkdownReportText(external)));
});
