import { useState, useEffect } from 'react';
import { CtnGenealogyReport, Log } from '../types';
import { searchCtnGenealogy } from '../services/dbLocal';

export const useCtnTraceability = (initialCtn: string = '') => {
  const [searchTerm, setSearchTerm] = useState(initialCtn);
  const [report, setReport] = useState<CtnGenealogyReport | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const performSearch = async (ctn: string) => {
    if (!ctn.trim()) return;
    setIsSearching(true);
    try {
      const data = await searchCtnGenealogy(ctn);
      setReport(data || null);
    } catch (err) {
      console.error('Erro na busca de CTN:', err);
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  return { searchTerm, setSearchTerm, report, isSearching, hasSearched, performSearch };
};
