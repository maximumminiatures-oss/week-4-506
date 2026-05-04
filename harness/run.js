/**
 * Deterministic harness for the save/publish race scenario.
 * Mirrors tests/race.test.js timing: SAVE_COMMIT_DELAY_MS=300, parallel save B + publish.
 */

process.env.SAVE_COMMIT_DELAY_MS = process.env.SAVE_COMMIT_DELAY_MS || '300';
process.env.INSTRUMENT_DEBUG = process.env.INSTRUMENT_DEBUG || '1';

const supertest = require('supertest');
const app = require('../app/server.js');

function iso() {
  return new Date().toISOString();
}

async function main() {
  const delay = process.env.SAVE_COMMIT_DELAY_MS;
  console.log(`=== harness run start ${iso()} ===`);
  console.log(`SAVE_COMMIT_DELAY_MS=${delay}`);
  console.log(
    'Scenario: POST /reset → save draft A (await) → save draft B (fire-and-forget) + POST /publish in parallel.',
  );
  console.log(
    'Timing: /publish is issued immediately alongside /draft B; publish handler often runs before B\'s delayed commit. Correct behavior: published text matches the latest save request (draft B), not only what currentDraft had committed at publish time.',
  );

  const agent = supertest(app);
  await agent.post('/reset').expect(200);
  console.log('[harness] POST /reset → 200');

  await agent.post('/draft').send({ content: 'draft A' }).expect(200);
  console.log('[harness] POST /draft "draft A" completed (committed before next step).');

  const saveBPromise = agent.post('/draft').send({ content: 'draft B' });
  const publishPromise = agent.post('/publish');

  const [saveBRes, publishRes] = await Promise.all([saveBPromise, publishPromise]);

  console.log(`[harness] POST /publish → published=${JSON.stringify(publishRes.body.published)}`);
  console.log(`[harness] POST /draft "draft B" → saved=${JSON.stringify(saveBRes.body?.saved)}`);

  const current = await agent.get('/current');
  const published = await agent.get('/published');
  console.log(`[harness] GET /current → ${JSON.stringify(current.body)}`);
  console.log(`[harness] GET /published → ${JSON.stringify(published.body)}`);
  console.log(`=== harness run end ${iso()} ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
