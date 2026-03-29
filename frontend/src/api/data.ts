import type { IndexData, DateData, CouncillorData } from '../types';

const cache = new Map<string, unknown>();

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchJSON<T>(path: string): Promise<T> {
  const key = `${BASE}${path}`;
  if (cache.has(key)) return cache.get(key) as T;
  const res = await fetch(key);
  if (!res.ok) throw new Error(`Failed to fetch ${key}: ${res.status}`);
  const data = await res.json() as T;
  cache.set(key, data);
  return data;
}

export const fetchIndex = (): Promise<IndexData> =>
  fetchJSON<IndexData>('/data/ottawa/index.json');

export const fetchDateData = (date: string): Promise<DateData> =>
  fetchJSON<DateData>(`/data/ottawa/dates/${date}.json`);

export const fetchCouncillorData = (slug: string): Promise<CouncillorData> =>
  fetchJSON<CouncillorData>(`/data/ottawa/councillors/${slug}.json`);
