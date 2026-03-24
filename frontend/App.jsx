import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Search from './components/Search/Search';
import './index.css';

const App = () => {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingEmp, setEditingEmp] = useState(null);
  const [activeTab, setActiveTab] = useState('employees');

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const resEmp = await axios.get('http://localhost:5000/api/employees');
      setEmployees(Array.isArray(resEmp.data) ? resEmp.data : []);
      if (activeTab === 'attendance') {
        const resAtt = await axios.get('http://localhost:5000/api/attendance');
        setAttendance(Array.isArray(resAtt.data) ? resAtt.data : []);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [activeTab]);

  const handleEditChange = (key, value) => {
    setEditingEmp({ ...editingEmp, [key]: value });
  };

  const saveEdit = async () => {
    try {
      const { id, ...updates } = editingEmp;
      await axios.put(`http://localhost:5000/api/employees/${editingEmp.id}`, updates);
      setEditingEmp(null);
      fetchEmployees();
    } catch (err) {
      console.error('Error updating:', err);
      alert('Failed to update employee fields');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/employees/${id}`);
      fetchEmployees();
    } catch (err) {
      console.error('Error deleting:', err);
      alert('Failed to delete employee');
    }
  };

  const markAttendance = async (empId, status) => {
    try {
      await axios.post('http://localhost:5000/api/attendance', { employee_id: empId, status });
      // update local state to feel instant
      setAttendance(attendance.map(a => a.employee_id === empId ? { ...a, status } : a));
    } catch (err) {
      console.error('Error marking attendance:', err);
      alert('Failed to mark attendance');
    }
  };

  const columns = employees.length > 0 
    ? Object.keys(employees[0]) 
    : ['id', 'name', 'role', 'email'];

  return (
    <div className="App">
      <div className="container">
        <header className="main-header">
          <h1>Employee Management System</h1>
          <p>AI-Powered HR Automation & Tracking</p>
        </header>

        {activeTab === 'employees' && <Search onAdd={fetchEmployees} />}

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
          <button 
            className={`tab-btn ${activeTab === 'employees' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('employees')}
            style={{ padding: '0.6rem 2rem', borderRadius: '8px', cursor: 'pointer', border: 'none', background: activeTab === 'employees' ? 'var(--accent-color)' : 'var(--card-bg)', color: activeTab === 'employees' ? 'white' : 'var(--text-color)', fontWeight: 'bold' }}>
            Employee Table
          </button>
          <button 
            className={`tab-btn ${activeTab === 'attendance' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('attendance')}
            style={{ padding: '0.6rem 2rem', borderRadius: '8px', cursor: 'pointer', border: 'none', background: activeTab === 'attendance' ? 'var(--accent-color)' : 'var(--card-bg)', color: activeTab === 'attendance' ? 'white' : 'var(--text-color)', fontWeight: 'bold' }}>
            Today's Attendance
          </button>
        </div>

        <div className="dashboard-grid">
          <div className="card full-width">
            <h2>{activeTab === 'employees' ? 'Employee Directory' : 'Daily Attendance Tracker'}</h2>
            
            {loading ? (
              <p>Loading data...</p>
            ) : activeTab === 'employees' ? (
              // EMPLOYEE TABLE
              !Array.isArray(employees) || employees.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No employees found. Try using the AI prompt to add one!
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="employee-table">
                    <thead>
                      <tr>
                        {columns.map(col => (
                          <th key={col} style={{ textTransform: 'capitalize' }}>{col.replace('_', ' ')}</th>
                        ))}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map(emp => (
                        <tr key={emp.id}>
                          {columns.map(col => (
                            <td key={col}>{emp[col] || '-'}</td>
                          ))}
                          <td>
                            <button className="edit-btn" onClick={() => setEditingEmp(emp)}>Edit</button>
                            <button className="att-btn" style={{ marginLeft: '0.5rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #f87171' }} onClick={() => handleDelete(emp.id)}>Delete</button>
                            <button className="att-btn" style={{ marginLeft: '0.5rem' }} onClick={() => setActiveTab('attendance')}>Mark Att</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              // ATTENDANCE TABLE
              !Array.isArray(attendance) || attendance.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No employees found to mark attendance.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="employee-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Quick Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map(att => (
                        <tr key={att.employee_id}>
                          <td>{att.employee_id}</td>
                          <td style={{ fontWeight: 'bold' }}>{att.name}</td>
                          <td>
                            <span style={{ 
                              padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold',
                              background: att.status === 'Present' ? '#dcfce7' : att.status === 'Absent' ? '#fee2e2' : att.status === 'Half-Day' ? '#fef3c7' : '#f1f5f9',
                              color: att.status === 'Present' ? '#166534' : att.status === 'Absent' ? '#991b1b' : att.status === 'Half-Day' ? '#92400e' : '#475569'
                            }}>
                              {att.status || 'Not Marked'}
                            </span>
                          </td>
                          <td style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="att-btn" style={{ background: '#22c55e', color: 'white', border: 'none' }} onClick={() => markAttendance(att.employee_id, 'Present')}>Present</button>
                            <button className="att-btn" style={{ background: '#ef4444', color: 'white', border: 'none' }} onClick={() => markAttendance(att.employee_id, 'Absent')}>Absent</button>
                            <button className="att-btn" style={{ background: '#f59e0b', color: 'white', border: 'none' }} onClick={() => markAttendance(att.employee_id, 'Half-Day')}>Half-Day</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {editingEmp && (
        <div className="modal-overlay" style={{
          position:'fixed', top:0, left:0, right:0, bottom:0, 
          background:'rgba(0,0,0,0.6)', display:'flex', 
          justifyContent:'center', alignItems:'center', zIndex:1000
        }}>
          <div className="card" style={{ width: '400px', background: 'var(--card-bg)', boxShadow:'0 10px 40px rgba(0,0,0,0.3)' }}>
            <h3>Edit Employee Details</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.8rem', marginTop:'1.5rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {columns.filter(c => c !== 'id').map(col => (
                <div key={col}>
                  <label style={{ display:'block', marginBottom:'0.3rem', textTransform:'capitalize', fontSize:'0.9rem', color:'var(--text-color)' }}>{col.replace('_', ' ')}</label>
                  <input 
                    type="text" 
                    value={editingEmp[col] || ''} 
                    onChange={(e) => handleEditChange(col, e.target.value)}
                    style={{
                      width:'100%', padding:'0.6rem', 
                      background:'transparent', border:'1px solid var(--border-color)',
                      color:'var(--text-color)', borderRadius:'6px'
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:'1rem', marginTop:'1rem' }}>
              <button onClick={saveEdit} style={{ flex:1, padding:'0.6rem', background:'var(--accent-color)', color:'white', border:'none', borderRadius:'6px', cursor:'pointer' }}>Save Changes</button>
              <button onClick={() => setEditingEmp(null)} style={{ flex:1, padding:'0.6rem', background:'transparent', border:'1px solid var(--border-color)', color:'var(--text-color)', borderRadius:'6px', cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
