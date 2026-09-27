import { create } from 'zustand';
import type { QueryPlan, QueryResult } from '../types';

interface QueryState {
  query: string;
  queryPlan: QueryPlan | null;
  selectedRegion: any;
  startDate: string | null;
  endDate: string | null;
  minDepth: number | null;
  maxDepth: number | null;
  variables: string[];
  results: QueryResult | null;
  loading: boolean;
  error: string | null;

  setQuery: (query: string) => void;
  setQueryPlan: (plan: QueryPlan | null) => void;
  setFilters: (filters: Partial<QueryState>) => void;
  setResults: (results: QueryResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  applyPlan: (plan: QueryPlan) => void;
  clearQuery: () => void;
}

export const useQueryStore = create<QueryState>((set) => ({
  query: '',
  queryPlan: null,
  selectedRegion: null,
  startDate: null,
  endDate: null,
  minDepth: null,
  maxDepth: null,
  variables: [],
  results: null,
  loading: false,
  error: null,

  setQuery: (query) => set({ query }),
  setQueryPlan: (plan) => set({ queryPlan: plan }),
  setFilters: (filters) => set({ ...filters }),
  setResults: (results) => set({ results }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  applyPlan: (plan) => set({ queryPlan: plan }),
  clearQuery: () => set({
    query: '',
    queryPlan: null,
    selectedRegion: null,
    startDate: null,
    endDate: null,
    minDepth: null,
    maxDepth: null,
    variables: [],
    results: null,
    error: null,
  }),
}));
