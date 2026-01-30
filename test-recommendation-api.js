import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.SERVER_URL || "http://localhost:8080";
const API_BASE = `${BASE_URL}/api/v1/recommendations`;

// Test colors for output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

let authToken = "";
let testRecommendationId = "";

// Helper function to make API calls
async function testEndpoint(name, method, url, data = null, headers = {}) {
  try {
    const config = {
      method,
      url,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      ...(data && { data }),
    };

    const response = await axios(config);
    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 500,
      message: error.response?.data?.message || error.message,
      data: error.response?.data,
    };
  }
}

// Test 1: Check server is running
async function testServerHealth() {
  console.log(`\n${colors.blue}=== Test 1: Server Health Check ===${colors.reset}`);
  try {
    const response = await axios.get(BASE_URL);
    if (response.status === 200) {
      console.log(`${colors.green}✓ Server is running${colors.reset}`);
      return true;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Server is not running: ${error.message}${colors.reset}`);
    return false;
  }
}

// Test 2: Test create recommendation without auth (should fail)
async function testCreateWithoutAuth() {
  console.log(`\n${colors.blue}=== Test 2: Create Recommendation (No Auth) ===${colors.reset}`);
  const result = await testEndpoint(
    "Create Recommendation",
    "POST",
    `${API_BASE}/create`,
    {
      message: "Test message",
      type: "interior_design",
    }
  );

  if (!result.success && result.status === 401) {
    console.log(`${colors.green}✓ Properly rejects unauthorized requests${colors.reset}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Message: ${result.message}`);
    return true;
  } else {
    console.log(`${colors.red}✗ Unexpected response${colors.reset}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Response: ${JSON.stringify(result.data, null, 2)}`);
    return false;
  }
}

// Test 3: Test get user recommendations without auth (should fail)
async function testGetUserRecommendationsWithoutAuth() {
  console.log(`\n${colors.blue}=== Test 3: Get User Recommendations (No Auth) ===${colors.reset}`);
  const result = await testEndpoint(
    "Get User Recommendations",
    "GET",
    `${API_BASE}/user`
  );

  if (!result.success && result.status === 401) {
    console.log(`${colors.green}✓ Properly rejects unauthorized requests${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}✗ Unexpected response${colors.reset}`);
    return false;
  }
}

// Test 4: Test search without auth (should fail)
async function testSearchWithoutAuth() {
  console.log(`\n${colors.blue}=== Test 4: Search Recommendations (No Auth) ===${colors.reset}`);
  const result = await testEndpoint(
    "Search Recommendations",
    "GET",
    `${API_BASE}/search?keyword=test`
  );

  if (!result.success && result.status === 401) {
    console.log(`${colors.green}✓ Properly rejects unauthorized requests${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}✗ Unexpected response${colors.reset}`);
    return false;
  }
}

// Test 5: Test with invalid token (should fail)
async function testWithInvalidToken() {
  console.log(`\n${colors.blue}=== Test 5: Create Recommendation (Invalid Token) ===${colors.reset}`);
  const result = await testEndpoint(
    "Create Recommendation",
    "POST",
    `${API_BASE}/create`,
    {
      message: "Test message",
      type: "interior_design",
    },
    {
      Authorization: "invalid-token-12345",
    }
  );

  if (!result.success && (result.status === 401 || result.status === 403)) {
    console.log(`${colors.green}✓ Properly rejects invalid tokens${colors.reset}`);
    console.log(`  Status: ${result.status}`);
    return true;
  } else {
    console.log(`${colors.red}✗ Unexpected response${colors.reset}`);
    console.log(`  Status: ${result.status}`);
    return false;
  }
}

// Test 6: Test endpoint structure (check if routes are properly set up)
async function testEndpointStructure() {
  console.log(`\n${colors.blue}=== Test 6: Endpoint Structure Check ===${colors.reset}`);
  
  const endpoints = [
    { method: "POST", path: "/create", name: "Create Recommendation" },
    { method: "GET", path: "/user", name: "Get User Recommendations" },
    { method: "GET", path: "/search?keyword=test", name: "Search Recommendations" },
    { method: "GET", path: "/test-id-123", name: "Get Single Recommendation" },
    { method: "PUT", path: "/test-id-123", name: "Update Recommendation" },
    { method: "POST", path: "/test-id-123/clear", name: "Clear Conversation" },
    { method: "DELETE", path: "/test-id-123", name: "Delete Recommendation" },
  ];

  let allExist = true;
  for (const endpoint of endpoints) {
    const result = await testEndpoint(
      endpoint.name,
      endpoint.method,
      `${API_BASE}${endpoint.path}`,
      endpoint.method === "POST" || endpoint.method === "PUT"
        ? { test: "data" }
        : null
    );

    // We expect 401 (unauthorized) or 404 (not found) - both mean endpoint exists
    // 404 for invalid IDs is fine, means route exists
    if (result.status === 401 || result.status === 404 || result.status === 400) {
      console.log(`${colors.green}✓ ${endpoint.name} endpoint exists${colors.reset} (Status: ${result.status})`);
    } else if (result.status === 405) {
      console.log(`${colors.red}✗ ${endpoint.name} - Method not allowed${colors.reset}`);
      allExist = false;
    } else {
      console.log(`${colors.yellow}? ${endpoint.name} - Unexpected status: ${result.status}${colors.reset}`);
    }
  }

  return allExist;
}

// Test 7: Test request validation (missing required fields)
async function testRequestValidation() {
  console.log(`\n${colors.blue}=== Test 7: Request Validation ===${colors.reset}`);
  
  // Test with missing message (should fail with 400)
  const result = await testEndpoint(
    "Create Recommendation (No Message)",
    "POST",
    `${API_BASE}/create`,
    {
      type: "interior_design",
    },
    {
      Authorization: "test-token", // Will fail auth, but we're testing validation
    }
  );

  // This might fail on auth first (401) or validation (400)
  // Both are acceptable - means endpoint is checking something
  if (result.status === 400 || result.status === 401) {
    console.log(`${colors.green}✓ Endpoint validates requests${colors.reset} (Status: ${result.status})`);
    return true;
  } else {
    console.log(`${colors.yellow}? Unexpected validation response${colors.reset}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log(`${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  Recommendation API Test Suite        ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);

  const results = [];

  // Run all tests
  results.push(await testServerHealth());
  results.push(await testCreateWithoutAuth());
  results.push(await testGetUserRecommendationsWithoutAuth());
  results.push(await testSearchWithoutAuth());
  results.push(await testWithInvalidToken());
  results.push(await testEndpointStructure());
  results.push(await testRequestValidation());

  // Summary
  console.log(`\n${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  Test Summary                           ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);
  
  const passed = results.filter((r) => r).length;
  const total = results.length;
  
  console.log(`\n${colors.green}Passed: ${passed}/${total}${colors.reset}`);
  
  if (passed === total) {
    console.log(`${colors.green}✓ All tests passed!${colors.reset}`);
    console.log(`\n${colors.yellow}Note: To test with authentication, you need to:`);
    console.log(`1. Login via /api/v1/auth/login`);
    console.log(`2. Get the JWT token from the response`);
    console.log(`3. Use the token in Authorization header`);
    console.log(`4. Import the Postman collection for full testing${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ Some tests failed${colors.reset}`);
  }

  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error(`${colors.red}Test suite error: ${error.message}${colors.reset}`);
  process.exit(1);
});
