import { defineConfig, devices } from "@playwright/test";

// E2E: 고정 데이터(FakeProvider)로 채운 별도 DB의 백엔드(8001) + 프로덕션 빌드 프론트(3100)
const win = process.platform === "win32";
const python =
  process.env.E2E_PYTHON ??
  (win ? "..\\backend\\.venv\\Scripts\\python.exe" : "../backend/.venv/bin/python");
const BACKEND_PORT = 8001;
const FRONT_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${FRONT_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /desktop\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `${python} -m app.jobs.collector all --provider fake && ${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: "../backend",
      env: { KRMAP_DATABASE_URL: "sqlite:///./data/e2e.db", KRMAP_SCHEDULER_ENABLED: "false" },
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run build && npm run start -- -p ${FRONT_PORT} -H 127.0.0.1`,
      env: { BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`, NEXT_DIST_DIR: ".next-e2e" },
      url: `http://127.0.0.1:${FRONT_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
