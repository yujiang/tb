import { runReactionReport } from "../fixtures/report_reactions";

// 运行：npm run test:build 后 node .test-build/tests/simple/test_report_reactions.js
runReactionReport().catch(error => { console.error(error); process.exitCode = 1; });
