import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchIndex,
  fetchDateData,
  fetchCouncillorData,
  fetchTagIndex,
  fetchTagData,
  fetchCommitteeIndex,
  fetchCommitteeData,
  fetchAlignmentData,
} from '../data';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api/data', () => {
  it('fetches and returns parsed JSON from the index endpoint', async () => {
    const body = { dates: ['2025-06-15'], councillors: [] };
    fetchMock.mockResolvedValueOnce(jsonResponse(body));

    const data = await fetchIndex();

    expect(data).toEqual(body);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url as string).toMatch(/\/data\/ottawa\/index\.json$/);
  });

  it('builds URLs with the given parameter for slug/date-based endpoints', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await fetchDateData('2025-06-15');
    await fetchCouncillorData('ariel-troster');
    await fetchTagData('housing');
    await fetchCommitteeData('finance-and-corporate-services');

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.some((u) => u.endsWith('/data/ottawa/dates/2025-06-15.json'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/data/ottawa/councillors/ariel-troster.json'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/data/ottawa/tags/housing.json'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/data/ottawa/committees/finance-and-corporate-services.json'))).toBe(true);
  });

  it('builds URLs for the index-style endpoints', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await fetchTagIndex();
    await fetchCommitteeIndex();
    await fetchAlignmentData();

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.some((u) => u.endsWith('/data/ottawa/tags/index.json'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/data/ottawa/committees/index.json'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/data/ottawa/alignment.json'))).toBe(true);
  });

  it('caches responses so a repeated request for the same resource does not refetch', async () => {
    const body = { date: '2025-01-01', meetings: [] };
    fetchMock.mockResolvedValue(jsonResponse(body));

    const first = await fetchDateData('2025-01-01');
    const second = await fetchDateData('2025-01-01');

    expect(first).toEqual(body);
    expect(second).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws an error including the status code when the response is not ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, false, 404));

    await expect(fetchCouncillorData('does-not-exist')).rejects.toThrow(/404/);
  });
});
