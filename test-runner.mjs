import XLSX from "xlsx";
import http from "http";

const BASE_URL = "http://localhost:5000";
const AGENT_ID = "0edd0f1d-d9b6-4bc5-8054-b35cd7557c8c";
const LOGIN_USERNAME = "kengqui.chia@ukg.com";
const LOGIN_PASSWORD = "123456";
const EXCEL_PATH = "attached_assets/expression-builder-use-cases_1770818321075.xlsx";

const START_ROW = parseInt(process.argv[2] || "5", 10);
const END_ROW = parseInt(process.argv[3] || "20", 10);

const DELAY_BETWEEN_TESTS_MS = 2000;

let sessionCookie = null;

async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"];
        if (setCookie) {
          sessionCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
        }
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login() {
  console.log(`Logging in as ${LOGIN_USERNAME}...`);
  const res = await request("POST", "/api/auth/login", {
    username: LOGIN_USERNAME,
    password: LOGIN_PASSWORD,
  });
  if (res.status !== 200) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  console.log("Logged in successfully.\n");
}

async function createSession(title) {
  const res = await request("POST", `/api/agents/${AGENT_ID}/sessions`, {
    agentId: AGENT_ID,
    title,
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to create session (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function sendMessage(sessionId, content) {
  const res = await request(
    "POST",
    `/api/agents/${AGENT_ID}/sessions/${sessionId}/messages`,
    { content }
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to send message (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readTestCases() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const testCases = [];
  for (let i = START_ROW - 1; i < Math.min(END_ROW, rows.length); i++) {
    const row = rows[i];
    if (!row || !row[8]) continue;

    testCases.push({
      rowNum: i + 1,
      useCaseId: row[4] || "",
      useCaseTitle: row[5] || "",
      category: row[2] || "",
      userPrompt: String(row[8]).replace(/^"|"$/g, ""),
      expectedBehavior: row[9] || "",
    });
  }
  return testCases;
}

async function runTests() {
  console.log("=".repeat(80));
  console.log("  HCM Expression Builder - Automated Test Runner");
  console.log("=".repeat(80));
  console.log(`  Testing rows ${START_ROW} to ${END_ROW}`);
  console.log(`  Agent: ${AGENT_ID}`);
  console.log("=".repeat(80));
  console.log();

  await login();

  const testCases = readTestCases();
  console.log(`Found ${testCases.length} test cases to run.\n`);

  const results = [];

  for (let idx = 0; idx < testCases.length; idx++) {
    const tc = testCases[idx];
    const testNum = idx + 1;

    console.log("-".repeat(80));
    console.log(`[${testNum}/${testCases.length}] Row ${tc.rowNum} | ${tc.useCaseId} - ${tc.useCaseTitle}`);
    console.log(`  Category: ${tc.category}`);
    console.log(`  Prompt:   ${tc.userPrompt}`);
    console.log();

    try {
      const sessionTitle = `Auto-Test: ${tc.useCaseId} - ${tc.useCaseTitle}`;
      const session = await createSession(sessionTitle);
      console.log(`  Session created: ${session.id}`);

      const response = await sendMessage(session.id, tc.userPrompt);

      let aiReply = "";
      if (Array.isArray(response)) {
        const assistantMsg = response.filter((m) => m.role === "assistant").pop();
        aiReply = assistantMsg?.content || JSON.stringify(response);
      } else {
        aiReply =
          response.aiMessage?.content ||
          response.content ||
          (typeof response === "string" ? response : JSON.stringify(response));
      }

      console.log(`  AI Response (first 500 chars):`);
      console.log(`  ${String(aiReply).substring(0, 500).replace(/\n/g, "\n  ")}`);
      console.log();
      console.log(`  Expected Behavior:`);
      console.log(`  ${String(tc.expectedBehavior).substring(0, 300).replace(/\n/g, "\n  ")}`);

      results.push({
        rowNum: tc.rowNum,
        useCaseId: tc.useCaseId,
        title: tc.useCaseTitle,
        prompt: tc.userPrompt,
        expectedBehavior: tc.expectedBehavior,
        aiResponse: String(aiReply),
        sessionId: session.id,
        status: "completed",
        error: null,
      });

      console.log(`  Status: COMPLETED`);
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.push({
        rowNum: tc.rowNum,
        useCaseId: tc.useCaseId,
        title: tc.useCaseTitle,
        prompt: tc.userPrompt,
        expectedBehavior: tc.expectedBehavior,
        aiResponse: null,
        sessionId: null,
        status: "error",
        error: err.message,
      });
    }

    if (idx < testCases.length - 1) {
      console.log(`\n  Waiting ${DELAY_BETWEEN_TESTS_MS / 1000}s before next test...\n`);
      await sleep(DELAY_BETWEEN_TESTS_MS);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("  SUMMARY");
  console.log("=".repeat(80));
  console.log(`  Total tests: ${results.length}`);
  console.log(`  Completed:   ${results.filter((r) => r.status === "completed").length}`);
  console.log(`  Errors:      ${results.filter((r) => r.status === "error").length}`);
  console.log("=".repeat(80));
  console.log();

  for (const r of results) {
    const icon = r.status === "completed" ? "OK" : "FAIL";
    console.log(`  [${icon}] Row ${r.rowNum} | ${r.useCaseId} - ${r.title}`);
  }

  const outputPath = `test-results-rows-${START_ROW}-to-${END_ROW}.json`;
  const fs = await import("fs");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results saved to: ${outputPath}`);
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
