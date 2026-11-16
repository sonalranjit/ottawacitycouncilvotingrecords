import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchIndex } from '../api/data';
import type { IndexData, Term } from '../types';
import { resolveTerm } from '../utils/terms';

/**
 * The council term selected via ?term= in the URL, defaulting to the current term.
 * `termQuery` is the query string to append to internal links so the selection
 * carries across pages; it is empty while no term is chosen explicitly.
 */
export function useTerm() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIndex()
      .then(setIndex)
      .catch((e: Error) => setError(e.message));
  }, []);

  const termParam = searchParams.get('term');
  const terms: Term[] = index?.terms ?? [];
  const term = index ? resolveTerm(terms, index.current_term, termParam, searchParams.get('date')) : null;

  function setTerm(slug: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('term', slug);
      // A date belongs to one term; drop it so the page picks the new term's latest date
      next.delete('date');
      return next;
    });
  }

  const termQuery = termParam ? `?term=${encodeURIComponent(termParam)}` : '';

  return { index, error, terms, term, setTerm, termQuery };
}
