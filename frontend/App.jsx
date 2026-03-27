import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Search from './components/Search/Search';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const App = () => {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingEmp, setEditingEmp] = useState(null);
  const [activeTab, setActiveTab] = useState('employees');
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', leave_type: 'Casual', start_date: '', end_date: '', reason: '' });
  const [showLeaveForm, setShowLeaveForm] = useState(false);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const resEmp = await axios.get(`${API_URL}/api/employees`);
      setEmployees(Array.isArray(resEmp.data) ? resEmp.data : []);
      if (activeTab === 'attendance') {
        const resAtt = await axios.get(`${API_URL}/api/attendance`);
        setAttendance(Array.isArray(resAtt.data) ? resAtt.data : []);
      }
      if (activeTab === 'leaves') {
        const resLeaves = await axios.get(`${API_URL}/api/leaves`);
        setLeaves(Array.isArray(resLeaves.data) ? resLeaves.data : []);
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
      await axios.put(`${API_URL}/api/employees/${editingEmp.id}`, updates);
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
      await axios.delete(`${API_URL}/api/employees/${id}`);
      fetchEmployees();
    } catch (err) {
      console.error('Error deleting:', err);
      alert('Failed to delete employee');
    }
  };

  const markAttendance = async (empId, status) => {
    try {
      await axios.post(`${API_URL}/api/attendance`, { employee_id: empId, status });
      // update local state to feel instant
      setAttendance(attendance.map(a => a.employee_id === empId ? { ...a, status } : a));
    } catch (err) {
      console.error('Error marking attendance:', err);
      alert('Failed to mark attendance');
    }
  };

  const applyLeave = async () => {
    if (!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date) {
      alert('Please select employee, start date and end date');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/leaves`, leaveForm);
      setLeaveForm({ employee_id: '', leave_type: 'Casual', start_date: '', end_date: '', reason: '' });
      setShowLeaveForm(false);
      fetchEmployees();
    } catch (err) {
      console.error('Error applying leave:', err);
      alert('Failed to apply leave');
    }
  };

  const updateLeaveStatus = async (leaveId, status) => {
    try {
      await axios.put(`${API_URL}/api/leaves/${leaveId}`, { status });
      setLeaves(leaves.map(l => l.id === leaveId ? { ...l, status } : l));
    } catch (err) {
      console.error('Error updating leave:', err);
      alert('Failed to update leave status');
    }
  };

  const deleteLeave = async (leaveId) => {
    if (!window.confirm('Delete this leave request?')) return;
    try {
      await axios.delete(`${API_URL}/api/leaves/${leaveId}`);
      setLeaves(leaves.filter(l => l.id !== leaveId));
    } catch (err) {
      console.error('Error deleting leave:', err);
      alert('Failed to delete leave');
    }
  };

  const columns = employees.length > 0
    ? Object.keys(employees[0])
    : ['id', 'name', 'role', 'email'];

  return (
    <div className="App">
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      
      <button 
        className="theme-toggle" 
        onClick={() => {
          const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', newTheme);
          localStorage.setItem('ems-theme', newTheme);
        }}
      >
        {document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙'}
      </button>

      <div className="container">
        <header className="main-header">
          <h1>EMS Dashboard</h1>
          <p style={{ color: 'var(--secondary-text)', fontWeight: '500', fontSize: '1.1rem' }}>
            Next-Gen HR Suite & AI Intelligence
          </p>
        </header>

        {activeTab === 'employees' && <Search onAdd={fetchEmployees} />}

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2.5rem', justifyContent: 'center' }}>
          {[
            { id: 'employees', label: 'Employee Hub', icon: '👥' },
            { id: 'attendance', label: 'Attendance', icon: '📅' },
            { id: 'leaves', label: 'Leave Manager', icon: '🏖️' },
            { id: 'payroll', label: 'Payroll (Beta)', icon: '💰' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active-tab' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ 
                padding: '0.8rem 1.8rem', 
                borderRadius: '16px', 
                cursor: 'pointer', 
                transition: 'all 0.3s ease',
                background: activeTab === tab.id ? '#4f46e5' : 'var(--card-bg)', 
                color: activeTab === tab.id ? 'white' : 'var(--text-color)',
                border: activeTab === tab.id ? '1px solid #4f46e5' : 'var(--glass-border)',
                backdropFilter: 'blur(10px)',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: activeTab === tab.id ? '0 8px 20px rgba(79, 70, 229, 0.3)' : 'none'
              }}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        <div className="dashboard-grid">
          <div className="card full-width">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '700' }}>
                {activeTab === 'employees' ? 'Staff Directory' : activeTab === 'attendance' ? 'Daily Attendance' : activeTab === 'leaves' ? 'Leave Management' : 'Payroll Management'}
              </h2>
              {activeTab === 'payroll' && (
                <button className="att-btn" style={{ background: '#4f46e5', color: 'white' }}>Generate Payouts</button>
              )}
              {activeTab === 'leaves' && (
                <span style={{ fontSize: '0.9rem', color: 'var(--secondary-text)' }}>
                  {leaves.filter(l => l.status === 'Pending').length} pending requests
                </span>
              )}
            </div>
            
            {loading ? (
              <div style={{ textAlign: 'center', padding: '4rem' }}>
                <div className="loader"></div>
                <p style={{ marginTop: '1rem', color: 'var(--secondary-text)' }}>Syncing with AI Cluster...</p>
              </div>
            ) : activeTab === 'employees' ? (
              // EMPLOYEE TABLE
              !Array.isArray(employees) || employees.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '4rem', color: 'var(--secondary-text)', fontSize: '1.1rem' }}>
                  No records active. Use the AI prompt to initialize staff.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="employee-table">
                    <thead>
                      <tr>
                        {columns.map(col => (
                          <th key={col}>{col.replace('_', ' ')}</th>
                        ))}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map(emp => (
                        <tr key={emp.id}>
                          {columns.map(col => (
                            <td key={col}>
                              {col === 'email' ? (
                                <span style={{ opacity: 0.8, fontSize: '0.9rem' }}>{emp[col]}</span>
                              ) : col === 'role' ? (
                                <span style={{ 
                                  padding: '4px 10px', background: 'rgba(79, 70, 229, 0.1)', 
                                  color: '#4f46e5', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600'
                                }}>
                                  {emp[col]}
                                </span>
                              ) : emp[col] || '-'}
                            </td>
                          ))}
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="edit-btn" onClick={() => setEditingEmp(emp)}>Edit</button>
                              <button className="att-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => handleDelete(emp.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : activeTab === 'attendance' ? (
              // ATTENDANCE TABLE
              !Array.isArray(attendance) || attendance.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '4rem', color: 'var(--secondary-text)' }}>
                  No attendance data for today.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="employee-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Position</th>
                        <th>Status</th>
                        <th>Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map(att => (
                        <tr key={att.employee_id}>
                          <td style={{ fontWeight: '600' }}>{att.name}</td>
                          <td>{att.role || 'Employee'}</td>
                          <td>
                            <span style={{ 
                              padding: '0.4rem 1rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700',
                              background: att.status === 'Present' ? 'rgba(34, 197, 94, 0.15)' : att.status === 'Absent' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: att.status === 'Present' ? '#10b981' : att.status === 'Absent' ? '#ef4444' : '#f59e0b'
                            }}>
                              {att.status || 'Pending'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="att-btn" onClick={() => markAttendance(att.employee_id, 'Present')}>Present</button>
                              <button className="att-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} onClick={() => markAttendance(att.employee_id, 'Absent')}>Absent</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : activeTab === 'leaves' ? (
              // LEAVE MANAGEMENT
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                  <button
                    className="att-btn"
                    style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.7rem 1.5rem', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}
                    onClick={() => setShowLeaveForm(!showLeaveForm)}
                  >
                    {showLeaveForm ? 'Cancel' : '+ Apply Leave'}
                  </button>
                </div>

                {showLeaveForm && (
                  <div style={{
                    background: 'var(--card-bg)', backdropFilter: 'blur(14px)', border: 'var(--glass-border)',
                    borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'
                  }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: 'var(--secondary-text)', fontWeight: '600' }}>Employee</label>
                      <select
                        value={leaveForm.employee_id}
                        onChange={(e) => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-color)', borderRadius: '8px' }}
                      >
                        <option value="">Select Employee</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: 'var(--secondary-text)', fontWeight: '600' }}>Leave Type</label>
                      <select
                        value={leaveForm.leave_type}
                        onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-color)', borderRadius: '8px' }}
                      >
                        <option value="Casual">Casual Leave</option>
                        <option value="Sick">Sick Leave</option>
                        <option value="Earned">Earned Leave</option>
                        <option value="Maternity">Maternity Leave</option>
                        <option value="Paternity">Paternity Leave</option>
                        <option value="Unpaid">Unpaid Leave</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: 'var(--secondary-text)', fontWeight: '600' }}>Start Date</label>
                      <input
                        type="date" value={leaveForm.start_date}
                        onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-color)', borderRadius: '8px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: 'var(--secondary-text)', fontWeight: '600' }}>End Date</label>
                      <input
                        type="date" value={leaveForm.end_date}
                        onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-color)', borderRadius: '8px' }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', color: 'var(--secondary-text)', fontWeight: '600' }}>Reason</label>
                      <input
                        type="text" value={leaveForm.reason} placeholder="Optional reason..."
                        onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-color)', borderRadius: '8px' }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
                      <button
                        onClick={applyLeave}
                        style={{ padding: '0.7rem 2rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Submit Leave Request
                      </button>
                    </div>
                  </div>
                )}

                {!Array.isArray(leaves) || leaves.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '4rem', color: 'var(--secondary-text)', fontSize: '1.1rem' }}>
                    No leave requests yet. Click "+ Apply Leave" to create one.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="employee-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Type</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Days</th>
                          <th>Reason</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaves.map(leave => {
                          const days = Math.ceil((new Date(leave.end_date) - new Date(leave.start_date)) / (1000 * 60 * 60 * 24)) + 1;
                          return (
                            <tr key={leave.id}>
                              <td style={{ fontWeight: '600' }}>{leave.employee_name}</td>
                              <td>
                                <span style={{
                                  padding: '4px 10px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600',
                                  background: leave.leave_type === 'Sick' ? 'rgba(239, 68, 68, 0.1)' : leave.leave_type === 'Earned' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                                  color: leave.leave_type === 'Sick' ? '#ef4444' : leave.leave_type === 'Earned' ? '#f59e0b' : '#4f46e5'
                                }}>
                                  {leave.leave_type}
                                </span>
                              </td>
                              <td>{new Date(leave.start_date).toLocaleDateString()}</td>
                              <td>{new Date(leave.end_date).toLocaleDateString()}</td>
                              <td style={{ fontWeight: '700' }}>{days}</td>
                              <td style={{ opacity: 0.8, fontSize: '0.9rem' }}>{leave.reason || '-'}</td>
                              <td>
                                <span style={{
                                  padding: '0.4rem 1rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700',
                                  background: leave.status === 'Approved' ? 'rgba(34, 197, 94, 0.15)' : leave.status === 'Rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: leave.status === 'Approved' ? '#10b981' : leave.status === 'Rejected' ? '#ef4444' : '#f59e0b'
                                }}>
                                  {leave.status}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  {leave.status === 'Pending' && (
                                    <>
                                      <button className="att-btn" onClick={() => updateLeaveStatus(leave.id, 'Approved')}>Approve</button>
                                      <button className="att-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => updateLeaveStatus(leave.id, 'Rejected')}>Reject</button>
                                    </>
                                  )}
                                  <button className="att-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => deleteLeave(leave.id)}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              // PAYROLL TABLE (Demo)
              <div style={{ overflowX: 'auto' }}>
                <table className="employee-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Base Salary</th>
                      <th>Bonus</th>
                      <th>Deductions</th>
                      <th>Net Pay</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id}>
                        <td style={{ fontWeight: '600' }}>{emp.name}</td>
                        <td>${emp.salary || '5,000'}</td>
                        <td style={{ color: '#10b981' }}>+$250</td>
                        <td style={{ color: '#ef4444' }}>-$120</td>
                        <td style={{ fontWeight: '700' }}>${(parseFloat(emp.salary?.replace(',','') || 5000) + 130).toLocaleString()}</td>
                        <td>
                          <span style={{ 
                            padding: '4px 10px', background: 'rgba(34, 197, 94, 0.1)', color: '#10b981', 
                            borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700' 
                          }}>Processed</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
