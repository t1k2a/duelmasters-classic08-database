import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCampaignPerformance } from '../../scripts/ga4-campaign-report.js';
import { generateActionStrategy, fetchRealAnalytics, escapeMarkdownReportText } from '../../scripts/ga4-analytics.js';

test('campaign requests paginate, keep posts separate and do not multiply sessions by events', async () => {
  const requests: any[] = [];
  const row = (content: string, count: string, event?: string) => ({ dimensionValues: ['x', 'social', 'launch', content, ...(event ? [event] : [])].map(value => ({ value })), metricValues: [{ value: count }] });
  const client = { runReport: async (request: any) => {
    requests.push(request);
    const events = request.metrics[0].name === 'eventCount';
    return [{ rows: events ? [row('post-a', '8', 'copy_deck'), row('post-a', '3', 'share_deck'), row('post-b', '2', 'click_buy_card')] : request.offset ? [row('post-b', '4')] : [row('post-a', '10')], rowCount: events ? 3 : 2 }];
  } } as any;
  const rows = await fetchCampaignPerformance(client, 'test-property');
  assert.deepEqual(rows.map(row => [row.content, row.sessions, row.copyDeck, row.shareDeck, row.buyCard]), [['post-a', 10, 8, 3, 0], ['post-b', 4, 0, 0, 2]]);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].dimensions.map((d: any) => d.name), ['sessionSource', 'sessionMedium', 'sessionCampaignName', 'sessionManualAdContent']);
  assert.ok(requests.every(r => r.dateRanges[0].endDate === 'yesterday'));
  assert.equal(requests[1].offset, 1);
  assert.ok(requests[2].dimensionFilter.filter.inListFilter.values.includes('deck_complete'));
});

test('empty campaign reports stay empty; API errors and incomplete pagination are not reported as zero', async () => {
  assert.deepEqual(await fetchCampaignPerformance({ runReport: async () => [{ rows: [] }] } as any, 'test'), []);
  await assert.rejects(fetchCampaignPerformance({ runReport: async () => { throw new Error('unavailable'); } } as any, 'test'), /unavailable/);
  await assert.rejects(fetchCampaignPerformance({ runReport: async () => [{ rows: [], rowCount: 1 }] } as any, 'test'), /incomplete/i);
});

test('missing rowCount continues full event pages and keeps identical content in different campaigns separate', async () => {
  const eventOffsets: number[] = [];
  const client = { runReport: async (request: any) => {
    if (request.metrics[0].name === 'sessions') return [{ rows: [] }];
    eventOffsets.push(request.offset);
    const row = (campaign: string) => ({ dimensionValues: ['x', 'social', campaign, 'same-post', 'copy_deck'].map(value => ({ value })), metricValues: [{ value: '1' }] });
    return [{ rows: request.offset === 0 ? Array.from({ length: request.limit }, (_, i) => row(`campaign-${i}`)) : [row('last-campaign')] }];
  } } as any;
  const rows = await fetchCampaignPerformance(client, 'test');
  assert.deepEqual(eventOffsets, [0, 10000]);
  assert.equal(rows.length, 10001);
  assert.ok(rows.every(row => row.copyDeck === 1 && row.sessions === 0));
});

test('report escapes campaign dimensions and labels event counts without claiming conversions', async () => {
  const data = await fetchRealAnalytics('test', { runReport: async () => [{ rows: [] }] } as any);
  const content = 'post|<script>\n# injected';
  const report = generateActionStrategy({ ...data, campaignPerformance: [{ source: 'x', medium: 'social', campaign: 'test', content, sessions: 2, copyDeck: 3, deckComplete: 0, shareDeck: 1, buyCard: 0, buyDeck: 0 }] });
  assert.ok(report.includes(escapeMarkdownReportText(content)));
  assert.match(report, /投稿別流入/);
  assert.match(report, /CVRではありません/);
});
