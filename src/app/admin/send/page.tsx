/**
 * Admin Send Page
 * 
 * Purpose: Minimal UI for creating and running send jobs
 * Security: Admin authentication required (TODO: implement)
 */

'use client';

import { useState } from 'react';

interface SendJob {
  job_id: string;
  dataset_id: string;
  status: string;
  created_at: string;
}

interface JobTotals {
  inserted: number;
  parse_errors: number;
  fallback_used: number;
  zero_audience: number;
  skipped: number;
  samples: {
    bad_rules: string[];
  };
}

export default function AdminSendPage() {
  const [datasetId, setDatasetId] = useState('');
  const [lastJob, setLastJob] = useState<SendJob | null>(null);
  const [jobTotals, setJobTotals] = useState<JobTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createJob = async () => {
    if (!datasetId.trim()) {
      setError('Dataset ID is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/send/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId })
      });

      const result = await response.json();

      if (result.ok) {
        setLastJob(result.data);
        setJobTotals(null);
      } else {
        setError(result.message || 'Failed to create job');
      }
    } catch (err) {
      setError('Network error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const runJob = async () => {
    if (!lastJob && !datasetId.trim()) {
      setError('No job to run. Create a job first or provide a dataset ID.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/send/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          job_id: lastJob?.job_id,
          dataset_id: lastJob ? undefined : datasetId
        })
      });

      const result = await response.json();

      if (result.ok) {
        setJobTotals(result.data.totals);
        if (result.data.job_id !== lastJob?.job_id) {
          setLastJob({
            job_id: result.data.job_id,
            dataset_id: result.data.dataset_id,
            status: result.data.status,
            created_at: new Date().toISOString()
          });
        }
      } else {
        setError(result.message || 'Failed to run job');
      }
    } catch (err) {
      setError('Network error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Send Management</h1>
      
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Create Send Job</h2>
        
        <div className="mb-4">
          <label htmlFor="dataset-id" className="block text-sm font-medium text-gray-700 mb-2">
            Dataset ID
          </label>
          <input
            id="dataset-id"
            type="text"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            placeholder="Enter dataset UUID"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={createJob}
            disabled={loading || !datasetId.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Job'}
          </button>
          
          <button
            onClick={runJob}
            disabled={loading || (!lastJob && !datasetId.trim())}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Running...' : 'Run (Preview Only)'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {lastJob && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Last Job</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Job ID</p>
              <p className="font-mono text-sm">{lastJob.job_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Dataset ID</p>
              <p className="font-mono text-sm">{lastJob.dataset_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="text-sm font-medium">{lastJob.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created</p>
              <p className="text-sm">{new Date(lastJob.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {jobTotals && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Job Results</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{jobTotals.inserted}</p>
              <p className="text-sm text-gray-600">Inserted</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{jobTotals.parse_errors}</p>
              <p className="text-sm text-gray-600">Parse Errors</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{jobTotals.fallback_used}</p>
              <p className="text-sm text-gray-600">Fallback Used</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{jobTotals.zero_audience}</p>
              <p className="text-sm text-gray-600">Zero Audience</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-600">{jobTotals.skipped}</p>
              <p className="text-sm text-gray-600">Skipped</p>
            </div>
          </div>

          {jobTotals.samples.bad_rules.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Bad Rules Sample:</p>
              <ul className="text-sm text-gray-600">
                {jobTotals.samples.bad_rules.map((rule, index) => (
                  <li key={index} className="font-mono">{rule}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
