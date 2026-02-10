'use client';

import React from 'react';
import type { ColumnMapping } from '@/lib/screening/column-detector';

interface ColumnMapperProps {
  headers: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  detectedFormat: 'scopus' | 'wos' | 'custom';
  confidence: number;
  disabled?: boolean;
}

const FIELD_LABELS: Record<keyof ColumnMapping, { label: string; required: boolean; description: string }> = {
  title: { label: 'Title', required: true, description: 'Article title column' },
  abstract: { label: 'Abstract', required: true, description: 'Abstract text column' },
  year: { label: 'Year', required: true, description: 'Publication year column' },
  journal: { label: 'Journal/Source', required: true, description: 'Journal or source title' },
  keywords: { label: 'Keywords', required: false, description: 'Keywords (optional, can be multiple columns separated by commas)' },
};

export default function ColumnMapper({
  headers,
  mapping,
  onMappingChange,
  detectedFormat,
  confidence,
  disabled = false,
}: ColumnMapperProps) {
  const handleChange = (field: keyof ColumnMapping, value: string) => {
    onMappingChange({
      ...mapping,
      [field]: value,
    });
  };

  const formatName = {
    scopus: 'Scopus',
    wos: 'Web of Science',
    custom: 'Custom/Unknown',
  }[detectedFormat];

  const confidenceColor =
    confidence >= 0.8
      ? 'text-green-600 bg-green-50'
      : confidence >= 0.5
      ? 'text-yellow-600 bg-yellow-50'
      : 'text-red-600 bg-red-50';

  return (
    <div className="space-y-4">
      {/* Detection Status */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Detected format:</span>
          <span className="font-medium text-black">{formatName}</span>
        </div>
        <div className={`px-2 py-1 rounded text-sm font-medium ${confidenceColor}`}>
          {Math.round(confidence * 100)}% confidence
        </div>
      </div>

      {/* Column Mappings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => {
          const { label, required, description } = FIELD_LABELS[field];
          const value = mapping[field];
          const isValid = !required || (value && headers.includes(value));

          return (
            <div key={field} className="space-y-1">
              <label className="block text-sm font-medium text-black">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                value={value}
                onChange={(e) => handleChange(field, e.target.value)}
                disabled={disabled}
                className={`
                  w-full px-3 py-2 border rounded-lg text-sm text-black
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
                  ${!isValid && required ? 'border-red-300' : 'border-gray-300'}
                `}
              >
                <option value="">-- Select column --</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">{description}</p>
            </div>
          );
        })}
      </div>

      {/* Validation Messages */}
      {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).some(
        (field) => FIELD_LABELS[field].required && !mapping[field]
      ) && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            <span className="font-medium">Missing required columns:</span>{' '}
            {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[])
              .filter((field) => FIELD_LABELS[field].required && !mapping[field])
              .map((field) => FIELD_LABELS[field].label)
              .join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
