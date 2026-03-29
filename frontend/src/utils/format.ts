/** Convert ISO date string YYYY-MM-DD to M/D/YYYY with no leading zeros. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${parseInt(month)}/${parseInt(day)}/${year}`;
}

/** Map a raw motion_result string to a display label. */
export function resultLabel(result: string): string {
  const r = result.toLowerCase();
  if (r.startsWith('carried') || r.startsWith('received')) return 'Carried';
  if (r.startsWith('lost')) return 'Lost';
  return result;
}

/** Return a CSS class key based on motion result: 'carried' | 'lost' | 'neutral'. */
export function resultVariant(result: string): 'carried' | 'lost' | 'neutral' {
  const r = result.toLowerCase();
  if (r.startsWith('carried') || r.startsWith('received')) return 'carried';
  if (r.startsWith('lost')) return 'lost';
  return 'neutral';
}
