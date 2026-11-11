// Every test file gets its own throw-away in-memory database and test-only secrets.
process.env.DATABASE_PATH = ":memory:";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.AUTO_BACKUP = "0";
process.env.ENFORCE_PLANS = "1"; // the plan-limit tests exercise enforcement; the app default is off
