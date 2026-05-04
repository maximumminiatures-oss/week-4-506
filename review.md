# Code review step

## Review prompt (fresh session)

Review this fix critically. Look for: failure modes it doesn’t address, edge cases missed, assumptions it makes about the system, alternative approaches that might be cleaner, anything a senior engineer would push back on. Be thorough. Assume the code has problems and find them.

**Context:** Express draft editor. `POST /draft` updates state after `SAVE_COMMIT_DELAY_MS`. The fix serializes delayed saves in a `saveQueue`; `/publish` snapshots that queue, awaits saves already in flight, and then copies `currentDraft` to `publishedDraft`. Instrumentation is gated by `INSTRUMENT_DEBUG=1`.

## Reviewer response (unedited transcript)

Awaiting a save queue is a cleaner fit for the app contract than publishing a separate “intent” field, because `/publish` still publishes the most recent **committed** draft; it simply waits for saves that had already arrived. Things I’d still scrutinize:

1. **Concurrent overlapping `/draft` requests from multiple clients** — state is still global. For this single-user toy app that’s fine; in production you’d scope by user/document id.

2. **Global save queue** — The queue is global, not per user or document. That is fine for the one-document assignment app, but a production app would queue saves per document so one user's slow save does not block another user's publish.

3. **Reset during an in-flight save** — The test-only `/reset` endpoint clears the queue variable, but a save callback that was already scheduled could still run later. The tests reset only between completed scenarios, so this is not currently observable.

4. **Error handling** — The simulated save never rejects, so awaiting the queue has no failure branch. In a real database write, publish needs to decide whether to fail, retry, or publish the previous committed draft.

5. **Instrumentation in production** — `INSTRUMENT_DEBUG` defaults off; good. Ensure deploy env doesn’t accidentally set it.

Overall for this codebase size, awaiting the pending save is a reasonable, readable fix. The main residual risks are global state and the fact that this toy save cannot fail.

## My engagement with each substantive point

| Point | Category | Response |
|-------|----------|----------|
| Global state with multiple clients | **Context-irrelevant** | The assignment app is in-memory, single-tenant, and the regression test models one browser. Sharding by user/document would be the real fix in a multi-user product; out of scope here. |
| Global save queue | **Real concern, out of scope** | A per-document queue would be better in production. This assignment has one in-memory document, so a single queue is enough and keeps the code readable. |
| Reset during an in-flight save | **Context-irrelevant** | `/reset` is a test helper, not user-facing behavior. The provided tests and harness call it only before a scenario starts, not while a save is still pending. |
| Error handling | **Real concern, out of scope** | The starter simulates storage with `setTimeout` and no failure mode. A real database write would need publish error semantics, but that is not part of this toy app. |
| `INSTRUMENT_DEBUG` in prod | **Real concern, addressed** | Instrumentation is opt-in via env; tests leave it unset so CI stays quiet. |

## What changed in the fix after review

I changed the fix after review. The earlier version published a synchronous `latestDraftIntent`; after auditing it, I replaced that with a `saveQueue`, so `/publish` waits for saves that were already in flight and then reads `currentDraft`.

If this were a multi-tenant service, the follow-up would be a per-document save queue and per-user/document state — noted for future work, not required for the course test gate.
