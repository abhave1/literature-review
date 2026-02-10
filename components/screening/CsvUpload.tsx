'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface CsvUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  disabled?: boolean;
  rowCount?: number;
  detectedFormat?: string;
}

export default function CsvUpload({
  onFileSelect,
  selectedFile,
  disabled = false,
  rowCount,
  detectedFormat,
}: CsvUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !disabled) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect, disabled]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxFiles: 1,
    disabled,
  });

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null as unknown as File);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${selectedFile ? 'border-green-500 bg-green-50' : ''}
        `}
      >
        <input {...getInputProps()} />

        {selectedFile ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <svg
                className="w-8 h-8 text-green-500"
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
              <span className="text-lg font-medium text-black">
                {selectedFile.name}
              </span>
            </div>

            <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
              <span>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </span>
              {rowCount !== undefined && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                  {rowCount.toLocaleString()} articles
                </span>
              )}
              {detectedFormat && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                  {detectedFormat} format
                </span>
              )}
            </div>

            {!disabled && (
              <button
                onClick={clearFile}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Remove file
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <svg
              className="w-12 h-12 mx-auto text-gray-400"
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
              <p className="text-blue-600 font-medium">Drop the CSV file here...</p>
            ) : (
              <>
                <p className="text-black">
                  <span className="font-medium text-blue-600">Click to upload</span> or drag
                  and drop
                </p>
                <p className="text-sm text-gray-500">
                  CSV file (Scopus or Web of Science export)
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
