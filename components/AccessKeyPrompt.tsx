'use client';

import { useState } from 'react';

interface AccessKeyPromptProps {
  onValidKey: () => void;
}

export default function AccessKeyPrompt({ onValidKey }: AccessKeyPromptProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!key.trim()) {
      setError('Please enter an access key');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      // Validate the key via API
      const response = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });

      const data = await response.json();

      if (data.valid) {
        // Save to localStorage
        localStorage.setItem('app_access_key', key.trim());
        onValidKey();
      } else {
        setError('Invalid access key. Please check and try again.');
        setKey('');
      }
    } catch (err) {
      setError('Failed to validate key. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-black mb-2">
          Access Required
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Please enter your access key to continue
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accessKey" className="block text-sm font-medium text-black mb-2">
              Access Key
            </label>
            <input
              id="accessKey"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your base64 access key"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              disabled={isValidating}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isValidating}
            className={`
              w-full py-3 rounded-lg font-semibold text-white transition-all
              ${
                isValidating
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'
              }
            `}
          >
            {isValidating ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Validating...
              </span>
            ) : (
              'Continue'
            )}
          </button>
        </form>

        {/* Help text */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an access key? Contact the administrator.
        </p>
      </div>
    </div>
  );
}
