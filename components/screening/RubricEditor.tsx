'use client';

import React, { useState } from 'react';
import type { ScreeningRubrics } from '@/lib/screening/default-rubrics';

interface RubricEditorProps {
  rubrics: ScreeningRubrics;
  onRubricsChange: (rubrics: ScreeningRubrics) => void;
  isDefault: boolean;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
  saveStatus: 'idle' | 'saved' | 'error';
  disabled?: boolean;
}

interface SectionConfig {
  key: keyof ScreeningRubrics;
  label: string;
  description: string;
  rows: number;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'inclusionRules',
    label: 'Inclusion Rules (RI)',
    description: 'Rules that, if met, include the article for review',
    rows: 12,
  },
  {
    key: 'exclusionRules',
    label: 'Exclusion Rules (RE)',
    description: 'Rules that exclude articles from the review',
    rows: 10,
  },
  {
    key: 'specialRules',
    label: 'Special Rules for Exclusion',
    description: 'Method-specific exclusion rules (HMM, PCA, etc.)',
    rows: 8,
  },
  {
    key: 'definitions',
    label: 'Definitions',
    description: 'Operational definitions of key terms',
    rows: 6,
  },
  {
    key: 'psychometricianJobs',
    label: "Psychometrician's Job List",
    description: 'List of tasks considered as psychometric work',
    rows: 6,
  },
  {
    key: 'mlTerms',
    label: 'ML Terms',
    description: 'Machine learning terms for identification',
    rows: 8,
  },
];

export default function RubricEditor({
  rubrics,
  onRubricsChange,
  isDefault,
  onSave,
  onReset,
  isSaving,
  saveStatus,
  disabled = false,
}: RubricEditorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['inclusionRules', 'exclusionRules']));

  const toggleSection = (key: string) => {
    const next = new Set(expandedSections);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedSections(next);
  };

  const handleChange = (key: keyof ScreeningRubrics, value: string) => {
    onRubricsChange({
      ...rubrics,
      [key]: value,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with status and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-black">Screening Rubrics</h3>
          {!isDefault && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
              Customized
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-600">Save failed</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={disabled || isSaving}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
              ${disabled || isSaving
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'}
            `}
          >
            {isSaving ? 'Saving...' : 'Save Rubrics'}
          </button>
          <button
            onClick={onReset}
            disabled={disabled || isSaving || isDefault}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
              ${disabled || isSaving || isDefault
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
            `}
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Collapsible sections */}
      <div className="space-y-2">
        {SECTIONS.map(({ key, label, description, rows }) => {
          const isExpanded = expandedSections.has(key);
          const value = rubrics[key] || '';

          return (
            <div
              key={key}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Section header */}
              <button
                onClick={() => toggleSection(key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="text-left">
                  <span className="font-medium text-black">{label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Section content */}
              {isExpanded && (
                <div className="p-4 border-t border-gray-200">
                  <textarea
                    value={value}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={disabled}
                    rows={rows}
                    className={`
                      w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-black
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
                    `}
                    placeholder={`Enter ${label.toLowerCase()}...`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
