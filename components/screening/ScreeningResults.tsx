'use client';

import React, { useState, useMemo } from 'react';
import type { ArticleRow } from '@/lib/screening/csv-parser';
import type { ScreeningResult, ScreeningDecision } from '@/lib/screening/response-parser';
import { getResultStats, getDecisionColor } from '@/lib/screening/response-parser';
import {
  exportScreeningToExcel,
  exportScreeningToCSV,
  exportDecisionsOnly,
} from '@/lib/screening/screening-exporter';

interface ScreeningResultsProps {
  articles: ArticleRow[];
  results: ScreeningResult[];
  fileName: string;
}

type FilterType = 'all' | ScreeningDecision;

export default function ScreeningResults({
  articles,
  results,
  fileName,
}: ScreeningResultsProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const stats = useMemo(() => getResultStats(results), [results]);

  const resultMap = useMemo(
    () => new Map(results.map((r) => [r.articleId, r])),
    [results]
  );

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      const result = resultMap.get(article.id);

      // Filter by decision
      if (filter !== 'all') {
        if (!result || result.decision !== filter) return false;
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = article.title.toLowerCase().includes(query);
        const matchesAbstract = article.abstract.toLowerCase().includes(query);
        const matchesRules = result?.rulesUsed.toLowerCase().includes(query);
        if (!matchesTitle && !matchesAbstract && !matchesRules) return false;
      }

      return true;
    });
  }, [articles, resultMap, filter, searchQuery]);

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedRows(next);
  };

  const handleExportExcel = () => {
    exportScreeningToExcel(articles, results, fileName.replace('.csv', ''));
  };

  const handleExportCSV = () => {
    exportScreeningToCSV(articles, results, fileName.replace('.csv', ''));
  };

  const handleExportDecisions = () => {
    exportDecisionsOnly(articles, results, fileName.replace('.csv', '-decisions'));
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-black">{stats.total}</div>
          <div className="text-xs text-gray-500">Total Processed</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.include}</div>
          <div className="text-xs text-green-600">Included</div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.exclude}</div>
          <div className="text-xs text-red-600">Excluded</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.noAbstract}</div>
          <div className="text-xs text-yellow-600">No Abstract</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.parseErrors}</div>
          <div className="text-xs text-purple-600">Parse Errors</div>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">Export:</span>
        <button
          onClick={handleExportExcel}
          className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Full Excel
        </button>
        <button
          onClick={handleExportCSV}
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Full CSV
        </button>
        <button
          onClick={handleExportDecisions}
          className="px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Decisions Only
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Filter:</span>
          {(['all', 'Include', 'Exclude', 'NoAbstract'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search titles, abstracts, or rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-sm text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Results Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-black w-12">#</th>
                <th className="px-4 py-3 text-left font-medium text-black">Title</th>
                <th className="px-4 py-3 text-left font-medium text-black w-24">Year</th>
                <th className="px-4 py-3 text-left font-medium text-black w-28">Decision</th>
                <th className="px-4 py-3 text-left font-medium text-black w-32">Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredArticles.map((article, idx) => {
                const result = resultMap.get(article.id);
                const isExpanded = expandedRows.has(article.id);
                const colors = result
                  ? getDecisionColor(result.decision)
                  : { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' };

                return (
                  <React.Fragment key={article.id}>
                    <tr
                      onClick={() => toggleRow(article.id)}
                      className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? 'bg-gray-50' : ''}`}
                    >
                      <td className="px-4 py-3 text-gray-500">{article.originalIndex + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="truncate max-w-md text-black" title={article.title}>
                            {article.title || 'Untitled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-black">{article.year}</td>
                      <td className="px-4 py-3">
                        {result ? (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                            {result.decision}
                          </span>
                        ) : (
                          <span className="text-gray-400">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-black truncate max-w-[120px]" title={result?.rulesUsed}>
                        {result?.rulesUsed || '-'}
                      </td>
                    </tr>

                    {/* Expanded Row */}
                    {isExpanded && result && (
                      <tr className="bg-gray-50">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="space-y-3 text-sm">
                            <div>
                              <span className="font-medium text-black">Journal:</span>{' '}
                              <span className="text-gray-600">{article.journal || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium text-black">Abstract:</span>
                              <p className="text-gray-600 mt-1 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {article.abstract || 'No abstract available'}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium text-black">Explanation:</span>
                              <p className="text-gray-600 mt-1 whitespace-pre-wrap">
                                {result.explanation}
                              </p>
                            </div>
                            {result.parseError && (
                              <div className="text-red-600">
                                <span className="font-medium">Parse Error:</span> {result.parseError}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {filteredArticles.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No articles match the current filter
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-sm text-gray-500 text-right">
        Showing {filteredArticles.length} of {articles.length} articles
      </div>
    </div>
  );
}
