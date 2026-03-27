import React, { useState } from 'react';
import axios from 'axios';
import './Search.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PromptBox = ({ onAdd }) => {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [queryResults, setQueryResults] = useState(null);
  const [chatResponse, setChatResponse] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    const lp = prompt.toLowerCase().trim();

    // Flexible Theme Switch Logic
    const isDark = /\b(dark|night|black)\b.*\b(theme|mode|switch|enable|on)\b|\b(dark|night|black)\b\s*\b(theme|mode)\b/.test(lp);
    const isLight = /\b(light|day|white)\b.*\b(theme|mode|switch|enable|on)\b|\b(light|day|white)\b\s*\b(theme|mode)\b/.test(lp);

    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('ems-theme', 'dark');
      setStatus('🌙 Dark Mode Activated!');
      setPrompt('');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    if (isLight) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('ems-theme', 'light');
      setStatus('☀️ Light Mode Activated!');
      setPrompt('');
      setTimeout(() => setStatus(''), 3000);
      return;
    }

    setLoading(true);
    setTestResults(null);
    setQueryResults(null);
    setChatResponse('');
    setStatus('🤖 AI Agent analyzing intent...');

    try {
      const response = await axios.post(`${API_URL}/api/agent`, { prompt });
      const data = response.data;

      // Check for chat response (General Intelligence)
      if (data.chat_response) {
        setChatResponse(data.chat_response);
      }

      // Check for test results
      const tr = data.test_results;
      if (tr && Array.isArray(tr.individual) && tr.individual.length > 0) {
        setTestResults(tr);
      }

      // Check for query results (Table output)
      const qr = data.query_rows;
      if (qr && Array.isArray(qr) && qr.length > 0) {
        setQueryResults(qr);
      }

      setStatus(`${data.status === 'success' ? '✅' : '❌'} ${data.message || 'Done!'}`);
      setPrompt('');
      
      // Always refresh data if successful, as it might have been a DB change or Code edit
      if (onAdd && data.status === 'success') {
        onAdd();
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Agent execution failed.';
      setStatus(`❌ ${errMsg}`);
    }

    setLoading(false);
    const hasPanels = testResults !== null || queryResults !== null || chatResponse !== '';
    setTimeout(() => { 
      setStatus(''); 
      // Keep panels visible longer if there's actual content
    }, hasPanels ? 15000 : 5000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="prompt-wrapper">
      <div className="prompt-container">
        <textarea
          placeholder="Ask anything... 'Add column Phone', 'List all developers', 'Who is Surya?', 'Change theme'"
          className="ai-prompt-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={3}
        />
        <div className="prompt-footer">
          <span className="prompt-hint">Shift + Enter for new line</span>
          <button
            type="button"
            onClick={handleSubmit}
            className="submit-prompt-btn"
            disabled={loading || !prompt.trim()}
          >
            {loading ? '⏳ Solving...' : 'Ask AI Agent 🚀'}
          </button>
        </div>
      </div>

      {status && <p className="search-status">{status}</p>}

      {/* AI Chat Response Panel */}
      {chatResponse && (
        <div className="chat-response-panel">
          <h4 className="chat-title">🤖 AI Assistant</h4>
          <p className="chat-content">{chatResponse}</p>
        </div>
      )}

      {/* Query Results Table */}
      {queryResults && queryResults.length > 0 && (
        <div className="query-results-panel">
          <h4 className="query-results-title">
            📋 Query Findings ({queryResults.length} {queryResults.length === 1 ? 'record' : 'records'})
          </h4>
          <div className="query-results-table-wrapper">
            <table className="query-results-table">
              <thead>
                <tr>
                  {Object.keys(queryResults[0]).map(col => (
                    <th key={col}>{col.replace('_', ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryResults.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j}>{val !== null && val !== undefined ? String(val) : '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Test Results Panel */}
      {testResults && testResults.individual && testResults.individual.length > 0 && (
        <div className="test-results-panel">
          <h4 className="test-results-title">🧪 Performance Tests</h4>
          <div className="test-results-summary">
            <span className="test-passed-badge">{testResults.passed} Success</span>
            <span className="test-failed-badge">{testResults.failed} Failed</span>
          </div>
          <ul className="test-results-list">
            {testResults.individual.map((t, i) => (
              <li key={i} className={`test-item ${t.status === 'PASS' ? 'test-pass' : 'test-fail'}`}>
                {t.status === 'PASS' ? '✅' : '❌'} {t.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PromptBox;

