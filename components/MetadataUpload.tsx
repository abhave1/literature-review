'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { parseMetadataFile, MetadataMap } from '@/lib/metadata-parser';

interface MetadataUploadProps {
  onMetadataLoaded: (metadata: MetadataMap | null, metadataHeaders?: string[]) => void;
  metadata: MetadataMap | null;
  disabled?: boolean;
}

export default function MetadataUpload({
  onMetadataLoaded,
  metadata,
  disabled = false,
}: MetadataUploadProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number>(0);
  const [filenameColumn, setFilenameColumn] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0 || disabled) return;

      const file = acceptedFiles[0];
      setError(null);
      setIsLoading(true);

      try {
        const result = await parseMetadataFile(file);
        setFileName(file.name);
        setRowCount(result.rowCount);
        setFilenameColumn(result.filenameColumn);
        // Pass non-filename headers so exports match the spreadsheet columns
        const nonFilenameHeaders = result.headers.filter(
          h => h.toLowerCase().trim() !== result.filenameColumn.toLowerCase().trim()
        );
        onMetadataLoaded(result.metadata, nonFilenameHeaders);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
        setFileName(null);
        setRowCount(0);
        setFilenameColumn('');
        onMetadataLoaded(null, undefined);
      } finally {
        setIsLoading(false);
      }
    },
    [onMetadataLoaded, disabled]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls', '.csv'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: disabled || isLoading,
  });

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFileName(null);
    setRowCount(0);
    setFilenameColumn('');
    setError(null);
    onMetadataLoaded(null, undefined);
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${metadata ? 'border-green-500 bg-green-50' : ''}
        `}
      >
        <input {...getInputProps()} />

        {isLoading ? (
          <div className="flex items-center justify-center gap-3">
            <svg
              className="animate-spin h-6 w-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-gray-600">Parsing metadata file...</span>
          </div>
        ) : metadata && fileName ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <svg
                className="w-6 h-6 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium text-black">{fileName}</span>
            </div>

            <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                {rowCount} rows
              </span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                Key: {filenameColumn}
              </span>
            </div>

            {!disabled && (
              <button
                onClick={clearFile}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                Remove file
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <svg
              className="w-8 h-8 mx-auto text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>

            {isDragActive ? (
              <p className="text-blue-600 font-medium text-sm">Drop the file here...</p>
            ) : (
              <>
                <p className="text-sm text-black">
                  <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  .xlsx, .xls, or .csv with a &quot;Filename in AI Bot&quot; column
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
