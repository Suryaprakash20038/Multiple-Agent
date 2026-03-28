import React, { useState } from 'react';
import axios from 'axios';
import './Search.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PromptBox = ({ onAdd, activeMode, setActiveMode }) => {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [queryResults, setQueryResults] = useState(null);
  const [chatResponse, setChatResponse] = useState('');
  const [imageResult, setImageResult] = useState(null);
  const [videoResult, setVideoResult] = useState(null);
  const [videoType, setVideoType] = useState('mp4');
  const [agentsUsed, setAgentsUsed] = useState([]);

  const placeholders = {
    query: "Ask about database... 'Add column Phone', 'List all developers', 'Apply leave for Surya 3 days'",
    general: "Ask anything... 'Generate a sunset image', 'Send email to john@mail.com', 'Search latest AI news', 'Plan a trip to Goa'"
  };

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
    setImageResult(null);
    setVideoResult(null);
    setVideoType('mp4');
    setAgentsUsed([]);
    setStatus('🤖 AI Agent analyzing intent...');

    try {
      const response = await axios.post(`${API_URL}/api/agent`, { prompt, mode: activeMode });
      const data = response.data;

      // Check for chat response (General Intelligence)
      if (data.chat_response) {
        setChatResponse(data.chat_response);
      }
      
      if (data.image_result) {
        // Proxy external images through backend to avoid CORS/redirect issues
        const proxyUrl = `${API_URL}/api/image-proxy?url=${encodeURIComponent(data.image_result)}`;
        setImageResult(proxyUrl);
      }

      if (data.video_result) {
        setVideoResult(data.video_result);
        setVideoType(data.video_type || 'mp4');
      }

      // Agents used (for general mode badge display)
      if (data.agents_used && Array.isArray(data.agents_used)) {
        setAgentsUsed(data.agents_used);
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
      <div className="mode-selector">
        <button 
          className={`mode-btn ${activeMode === 'query' ? 'active' : ''}`}
          onClick={() => setActiveMode('query')}
        >
          <span className="mode-icon">🔍</span> Query Prompt
        </button>
        <button 
          className={`mode-btn ${activeMode === 'general' ? 'active' : ''}`}
          onClick={() => setActiveMode('general')}
        >
          <span className="mode-icon">🧠</span> General Prompt
        </button>
      </div>

      <div className="prompt-container">
        <textarea
          placeholder={placeholders[activeMode]}
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

      {/* Agents Used Badges */}
      {agentsUsed.length > 0 && (
        <div className="agents-used-bar">
          <span className="agents-label">Agents:</span>
          {agentsUsed.map((a, i) => (
            <span key={i} className="agent-badge">
              {a.agent === 'Orchestrator' ? '🧠' : a.agent === 'Chat' ? '💬' : a.agent === 'Image' ? '🎨' : a.agent === 'Video' ? '🎬' : a.agent === 'Email' ? '📧' : a.agent === 'Search' ? '🔍' : '⚙️'} {a.agent}
            </span>
          ))}
        </div>
      )}

      {/* AI Chat Response Panel */}
      {chatResponse && (
        <div className="chat-response-panel">
          <div className="chat-header">
            <h4 className="chat-title">
              {agentsUsed.some(a => a.agent === 'Image') ? '🎨 AI Vision Studio'
                : agentsUsed.some(a => a.agent === 'Email') ? '📧 AI Mail Agent'
                : agentsUsed.some(a => a.agent === 'Search') ? '🔍 AI Search Engine'
                : agentsUsed.some(a => a.agent === 'Video') ? '🎬 AI Video Studio'
                : imageResult ? '🎨 AI Image Creator'
                : videoResult ? '🎬 AI Video Editor'
                : '🤖 AI Assistant'}
            </h4>
          </div>
          <p className="chat-content">{chatResponse}</p>
          
          {imageResult && (
            <div className="media-result-container">
              <div className="media-frame">
                <img
                  src={imageResult}
                  alt="AI Generated"
                  className="generated-media"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    e.target.classList.add('loaded');
                    setStatus('✅ Vision Synthesized Successfully');
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    setStatus('❌ Image failed to load. Try a different prompt.');
                  }}
                />
                <div className="media-loader">🎨 Synthesizing Pixel-Perfect Vision...</div>
              </div>
              <div className="media-actions">
                <a href={imageResult} target="_blank" rel="noreferrer" className="media-btn">Open in High-Res ↗️</a>
                <a href={imageResult} download="ai-vision.jpg" className="media-btn">Save to Hub ⬇️</a>
              </div>
            </div>
          )}

          {videoResult && (
            <div className="media-result-container">
              {videoType === 'embed' ? (
                <iframe
                  src={videoResult}
                  title="AI Video"
                  style={{ width: '100%', height: '400px', borderRadius: '16px', border: 'none' }}
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  onLoad={() => setStatus('✅ Video Loaded Successfully')}
                />
              ) : (
                <video
                  src={videoResult}
                  controls
                  autoPlay
                  muted
                  playsInline
                  style={{ width: '100%', borderRadius: '16px', opacity: 1 }}
                  onLoadedData={() => setStatus('✅ Video Rendered Successfully')}
                  onError={() => setStatus('❌ Video failed to load. Try a different prompt.')}
                />
              )}
              <div className="media-actions">
                <span className="media-status">Rendered in 4K 💎</span>
              </div>
            </div>
          )}
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

