# Tasks

- [x] 1.1 Add server helper for per-connection delta private patches
- [x] 1.2 Send personalized `privatePatch.playerActions` in incremental broadcasts
- [x] 1.3 Apply `privatePatch.playerActions` in the client delta reducer with seat rotation
- [x] 1.4 Add backend coverage for personalized response-window deltas without action leakage
- [x] 1.5 Add client coverage for private patch action restore and stale action clearing
- [x] 1.6 Keep partial animation ACKs from advancing the public room version
- [x] 1.7 Add coverage for multi-player animation ACK version stability
- [x] 1.8 Run `node scripts/run-online-checks.mjs`
- [x] 1.9 Run `node scripts/run-backend-checks.mjs`
- [x] 1.10 Run `node scripts/run-server-core-checks.mjs`
