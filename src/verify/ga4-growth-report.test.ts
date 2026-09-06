import assert from 'node:assert/strict';
import test from 'node:test';
import type { BetaAnalyticsDataClient } from '@google-analytics/data';
import {
  aggregateGrowthPeriod,
  fetchGrowthPeriod,
  renderGrowthFunnel,
  renderGrowthPeriodComparison,
} from '../../scripts/ga4-analytics.js';

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
