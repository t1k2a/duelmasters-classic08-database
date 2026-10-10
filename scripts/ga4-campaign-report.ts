import type { BetaAnalyticsDataClient } from '@google-analytics/data';

export interface CampaignPerformance {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  sessions: number;
  copyDeck: number;
  deckComplete: number;
  shareDeck: number;
  buyCard: number;
  buyDeck: number;
}

const dimensions = ['sessionSource', 'sessionMedium', 'sessionCampaignName', 'sessionManualAdContent'];
const eventFields = { copy_deck: 'copyDeck', deck_complete: 'deckComplete', share_deck: 'shareDeck', click_buy_card: 'buyCard', click_buy_deck: 'buyDeck' } as const;

/** Fetch completed 30-day session acquisition and event counts, joining by all four dimensions. */
export async function fetchCampaignPerformance(client: Pick<BetaAnalyticsDataClient, 'runReport'>, propertyId: string): Promise<CampaignPerformance[]> {
  const results = new Map<string, CampaignPerformance>();
  // Sessions must be queried separately: a session can contain several event names.
  for (const events of [false, true]) {
    let offset = 0;
    while (true) {
      const [response] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }],
        dimensions: [...dimensions, ...(events ? ['eventName'] : [])].map(name => ({ name })),
        metrics: [{ name: events ? 'eventCount' : 'sessions' }],
        ...(events ? { dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: Object.keys(eventFields) } } } } : {}),
        orderBys: [...dimensions, ...(events ? ['eventName'] : [])].map(dimensionName => ({ dimension: { dimensionName } })),
        limit: 10000,
        offset,
      });
      const rows = response.rows || [];
      for (const row of rows) {
        const values = dimensions.map((_, index) => row.dimensionValues?.[index]?.value ?? '(not set)');
        const key = JSON.stringify(values);
        const entry = results.get(key) || { source: values[0], medium: values[1], campaign: values[2], content: values[3], sessions: 0, copyDeck: 0, deckComplete: 0, shareDeck: 0, buyCard: 0, buyDeck: 0 };
        const count = Number(row.metricValues?.[0]?.value || 0);
        if (!Number.isFinite(count) || count < 0) throw new Error('Invalid GA4 campaign metric');
        const field = events ? eventFields[row.dimensionValues?.[4]?.value as keyof typeof eventFields] : 'sessions';
        if (field) entry[field] += count;
        results.set(key, entry);
      }
      offset += rows.length;
      if (offset >= (response.rowCount ?? rows.length)) break;
      if (rows.length === 0) throw new Error('Incomplete GA4 campaign pagination');
    }
  }
  return [...results.values()].sort((a, b) => b.sessions - a.sessions);
}
