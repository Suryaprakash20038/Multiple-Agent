// automated_tests.js - Full Lifecycle Integration Tests
const API_URL = 'http://localhost:5000';

async function runTests() {
  console.log('🧪 Starting COMPREHENSIVE Automated Tests...');
  let testUserId = null;

  try {
    // 1. ADD EMPLOYEE
    console.log('➡️ Testing: Add Employee...');
    const addRes = await fetch(`${API_URL}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CI Test User', role: 'Tester', email: `citest_${Date.now()}@example.com` })
    });
    if (!addRes.ok) throw new Error(`Add Employee failed: ${addRes.status}`);
    const newUser = await addRes.json();
    testUserId = newUser.id;
    console.log('✅ Success: Employee Added (ID:', testUserId, ')');

    // 2. UPDATE EMPLOYEE
    console.log('➡️ Testing: Update Employee...');
    const updateRes = await fetch(`${API_URL}/api/employees/${testUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Senior Tester' })
    });
    if (!updateRes.ok) throw new Error(`Update Employee failed: ${updateRes.status}`);
    const updatedUser = await updateRes.json();
    if (updatedUser.role !== 'Senior Tester') throw new Error('Update verify failed: role mismatch');
    console.log('✅ Success: Employee Updated to Senior Tester');

    // 3. DELETE EMPLOYEE
    console.log('➡️ Testing: Delete Employee...');
    const delRes = await fetch(`${API_URL}/api/employees/${testUserId}`, {
      method: 'DELETE'
    });
    if (!delRes.ok) throw new Error(`Delete Employee failed: ${delRes.status}`);
    console.log('✅ Success: Employee Deleted');

    // 4. ADD FIELD (AI AGENT)
    console.log('➡️ Testing: AI Agent Add Field (phone)...');
    const agentAddRes = await fetch(`${API_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Add field phone' })
    });
    if (!agentAddRes.ok) throw new Error(`AI Add Field failed: ${agentAddRes.status}`);
    const agentAddData = await agentAddRes.json();
    console.log('✅ Success: AI Agent Added Field. Status:', agentAddData.status);

    // 5. DELETE FIELD (AI AGENT)
    console.log('➡️ Testing: AI Agent Delete Field (phone)...');
    const agentDelRes = await fetch(`${API_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Delete field phone' })
    });
    if (!agentDelRes.ok) throw new Error(`AI Delete Field failed: ${agentDelRes.status}`);
    const agentDelData = await agentDelRes.json();
    console.log('✅ Success: AI Agent Deleted Field. Status:', agentDelData.status);

    console.log('\n🏆 ALL TESTS PASSED! CI/CD Pipeline Secure. 🚀');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
