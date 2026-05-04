// Save-and-Publish Draft Editor
//
// This app has a known race condition between /draft and /publish.
// See README.md for the bug description and what you're being asked to do.

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

// ---------------------------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------------------------
// `currentDraft` is the most recent saved draft.
// `publishedDraft` is what /publish has marked as live.
//
// In a real app these would live in a database. For this assignment, in-memory
// is fine — the bug is in the timing, not the storage.
let currentDraft = '';
let publishedDraft = '';

// SAVE_COMMIT_DELAY_MS controls how long a /draft request takes to commit.
// In production this would represent database write latency, network latency,
// or any other delay between "request received" and "value updated."
//
// Set to 200ms by default to make the race condition reliably reproducible.
// Tests may override this via environment variable.
const SAVE_COMMIT_DELAY_MS = parseInt(process.env.SAVE_COMMIT_DELAY_MS || '200', 10);

const INSTRUMENT_DEBUG = process.env.INSTRUMENT_DEBUG === '1';
let instrumentSeq = 0;

function instrument(event, detail) {
  if (!INSTRUMENT_DEBUG) return;
  const ts = new Date().toISOString();
  const payload = { ...detail, SAVE_COMMIT_DELAY_MS };
  console.error(`[${ts}] [race-instr] ${event} ${JSON.stringify(payload)}`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /draft — save the current draft text.
//
// Note the artificial delay: the draft is not committed to currentDraft
// until SAVE_COMMIT_DELAY_MS milliseconds after the request arrives.
app.post('/draft', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a string' });
  }

  const reqId = ++instrumentSeq;
  instrument('draft:enter', {
    reqId,
    bodyContent: content,
    currentDraft,
    publishedDraft,
  });

  // Simulate write latency.
  setTimeout(() => {
    instrument('draft:commit', {
      reqId,
      bodyContent: content,
      currentDraftBefore: currentDraft,
    });
    currentDraft = content;
    instrument('draft:after-commit', { reqId, currentDraft, publishedDraft });
    res.json({ ok: true, saved: content });
    instrument('draft:response-sent', { reqId, saved: content });
  }, SAVE_COMMIT_DELAY_MS);
});

// POST /publish — mark the most recent saved draft as live.
//
// THE BUG: this reads currentDraft *immediately*. If a /draft request is
// in flight (its timeout hasn't fired), publishedDraft will be set to the
// older saved value, not the in-flight one.
app.post('/publish', (req, res) => {
  const reqId = ++instrumentSeq;
  instrument('publish:enter', {
    reqId,
    currentDraftRead: currentDraft,
    publishedDraftBefore: publishedDraft,
  });
  publishedDraft = currentDraft;
  instrument('publish:exit', {
    reqId,
    publishedDraft,
    source: 'publishedDraft := currentDraft (immediate read — stale if save still committing)',
  });
  res.json({ ok: true, published: publishedDraft });
});

// GET /published — return the currently published draft.
app.get('/published', (req, res) => {
  res.json({ published: publishedDraft });
});

// GET /current — return the currently saved (committed) draft.
app.get('/current', (req, res) => {
  res.json({ current: currentDraft });
});

// Reset endpoint for tests.
app.post('/reset', (req, res) => {
  currentDraft = '';
  publishedDraft = '';
  instrument('reset', { currentDraft, publishedDraft });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Draft editor running on http://localhost:${PORT}`);
    console.log(`SAVE_COMMIT_DELAY_MS = ${SAVE_COMMIT_DELAY_MS}`);
  });
}

module.exports = app;
