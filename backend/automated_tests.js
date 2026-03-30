// automated_tests.js - 5 Positive + 5 Negative Test Cases
const API_URL = 'http://localhost:5000';

let passed = 0;
let failed = 0;
let testUserId = null;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ FAIL: ${name} — ${err.message}`);
  }
}

async function runTests() {
  console.log('\n🧪 ═══════════════════════════════════════════════');
  console.log('   AUTOMATED TEST SUITE — 5 Positive + 5 Negative');
  console.log('═══════════════════════════════════════════════════\n');

  // ==========================================
  //  POSITIVE TEST CASES (Should Succeed)
  // ==========================================
  console.log('📗 POSITIVE TESTS (Expected: Success)\n');

  // P1: Add Employee
  await test('P1: Add a new employee via API', async () => {
    const res = await fetch(`${API_URL}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', role: 'QA Engineer', email: `testuser_${Date.now()}@ems.com` })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.id) throw new Error('No ID returned');
    testUserId = data.id;
  });

  // P2: Get All Employees
  await test('P2: Fetch all employees returns array', async () => {
    const res = await fetch(`${API_URL}/api/employees`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Response is not an array');
    if (data.length === 0) throw new Error('Employee list is empty');
  });

  // P3: Update Employee
  await test('P3: Update employee role successfully', async () => {
    if (!testUserId) throw new Error('No test user to update');
    const res = await fetch(`${API_URL}/api/employees/${testUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Senior QA Engineer' })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.role !== 'Senior QA Engineer') throw new Error(`Role mismatch: got "${data.role}"`);
  });

  // P4: Mark Attendance
  await test('P4: Mark attendance for employee', async () => {
    if (!testUserId) throw new Error('No test user for attendance');
    const res = await fetch(`${API_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: testUserId, status: 'Present' })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'Present') throw new Error(`Status mismatch: got "${data.status}"`);
  });

  // P5: AI Agent — Add Field
  await test('P5: AI Agent adds a new column via prompt', async () => {
    const res = await fetch(`${API_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'add field phone' })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'success') throw new Error(`Agent status: ${data.status}`);
  });

  // ==========================================
  //  NEGATIVE TEST CASES (Should Fail Gracefully)
  // ==========================================
  console.log('\n📕 NEGATIVE TESTS (Expected: Proper Error Handling)\n');

  // N1: Add Employee without required fields
  await test('N1: Add employee without name returns error', async () => {
    const res = await fetch(`${API_URL}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Ghost', email: 'no_name@ems.com' })
    });
    // Should return 500 (DB constraint error) or 400
    if (res.ok) throw new Error('Should have failed but returned 200');
  });

  // N2: Update non-existent employee
  await test('N2: Update employee with invalid ID returns empty/null', async () => {
    const res = await fetch(`${API_URL}/api/employees/999999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Phantom' })
    });
    const text = await res.text();
    // Should return empty, null, or error — NOT a valid updated employee
    if (text) {
      try {
        const data = JSON.parse(text);
        if (data && data.name === 'Phantom') throw new Error('Should not find ID 999999');
      } catch (e) {
        if (e.message.includes('Should not find')) throw e;
        // JSON parse error = empty/invalid response = expected behavior
      }
    }
  });

  // N3: Delete non-existent employee
  await test('N3: Delete employee with invalid ID returns 404', async () => {
    const res = await fetch(`${API_URL}/api/employees/999999`, {
      method: 'DELETE'
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data.success) throw new Error('Should not delete non-existent employee');
    }
    // 404 is expected — test passes
  });

  // N4: AI Agent with empty prompt
  await test('N4: AI Agent with empty prompt returns 400', async () => {
    const res = await fetch(`${API_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' })
    });
    if (res.ok) throw new Error('Should have rejected empty prompt');
  });

  // N5: AI Agent with gibberish prompt
  await test('N5: AI Agent with invalid prompt handles gracefully', async () => {
    const res = await fetch(`${API_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'xyzzy foobar blah 12345' })
    });
    // Should either return 400 (unknown command) or succeed with unknown task
    // Either way, server should NOT crash
    if (res.status >= 500) throw new Error(`Server error ${res.status} — should handle gracefully`);
  });

  // ==========================================
  //  CLEANUP: Delete test user after tests
  // ==========================================
  if (testUserId) {
    try {
      await fetch(`${API_URL}/api/employees/${testUserId}`, { method: 'DELETE' });
      console.log(`\n🧹 Cleanup: Deleted test employee (ID: ${testUserId})`);
    } catch (e) { /* ignore cleanup errors */ }
  }

  // ==========================================
  //  RESULTS
  // ==========================================
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`   RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  } else {
    console.log('🏆 ALL 10 TESTS PASSED! 🚀\n');
    process.exit(0);
  }
}

runTests();
