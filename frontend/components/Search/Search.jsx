import React, { useState } from 'react';
import axios from 'axios';
import './Search.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PromptBox = ({ onAdd }) => {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setStatus('🤖 Processing AI Command in Python Swarm...');

    const lowerPrompt = prompt.toLowerCase();
    
    const allowedKeywords = ['add', 'delete', 'remove', 'update', 'modify', 'change', 'deploy', 'test', 'field', 'column'];
    const isAllowed = allowedKeywords.some(key => lowerPrompt.includes(key));
    
    if (isAllowed) {
      try {
        const response = await axios.post(`${API_URL}/api/agent`, {
          prompt: prompt
        });
        
        setStatus(`✅ ${response.data.message || 'Success!'}`);
        setPrompt('');
        if (onAdd) onAdd(); 
      } catch (err) {
        console.error(err);
        setStatus('❌ Agent Error: System failed to execute the task.');
      }
    } else {
      setStatus('⚠️ Command not understood. Use keywords like "Add", "Update", or "Delete".');
    }
    
    setLoading(false);
    setTimeout(() => setStatus(''), 5000);
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
          placeholder="Ask AI... E.g., 'Add Arun Kumar as Dev with an extra field Phone'" 
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
            {loading ? '⏳ Working...' : 'Submit Agent 🚀'}
          </button>
        </div>
      </div>
      {status && <p className="search-status">{status}</p>}
    </div>
  );
};

export default PromptBox;
