// Built-in Fetch is available in Node > 18
async function testAPI() {
  console.log('🧪 Starting AI Agent Integration Test...');
  try {
    const res = await fetch('http://localhost:5000/api/employees');
    if (res.ok) {
      console.log('✅ Integration Test Passed! API is healthy. Status:', res.status);
      process.exit(0);
    } else {
      console.error('❌ Integration Test Failed! API returned:', res.status);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Server is unreachable or down:', err.message);
    process.exit(1);
  }
}

testAPI();
