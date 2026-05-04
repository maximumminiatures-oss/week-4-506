# Code review step

## Review prompt (fresh session)

Review this fix critically. Look for: failure modes it doesn’t address, edge cases missed, assumptions it makes about the system, alternative approaches that might be cleaner, anything a senior engineer would push back on. Be thorough. Assume the code has problems and find them.

**Context:** Express draft editor. `POST /draft` updates state after `SAVE_COMMIT_DELAY_MS`. The fix adds `latestDraftIntent`, set synchronously on each `/draft`, and `/publish` copies `latestDraftIntent` instead of `currentDraft`. Instrumentation is gated by `INSTRUMENT_DEBUG=1`.

## Reviewer response (unedited transcript)

Using `latestDraftIntent` fixes the assignment regression by treating “most recent save” as **last accepted HTTP body**, not last committed write. That matches the test. Things I’d still scrutinize:

1. **Concurrent overlapping `/draft` requests from multiple clients** — `latestDraftIntent` is one global string; last writer wins with no per-session isolation. For this single-user toy app that’s fine; in production you’d scope by user/document id.

2. **Ordering vs durability** — If two saves are in flight and the older one commits after the newer one due to weird scheduling, `currentDraft` could theoretically end up behind `latestDraftIntent` briefly in stranger setups than Express’s single-threaded dispatch; your publish still follows “intent,” which is what the product requirement stated here. Document that publish is “intent-based,” not “wait until DB catches up.”

3. **Alternative: queue or await pending save** — Another fix is to chain promises so `/publish` awaits any in-flight commit. That keeps “published” aligned with committed storage but adds latency and complexity; intent capture is simpler for the stated bug.

4. **Security / validation** — You still only check `typeof content === 'string'`. Not new, but publish now amplifies trust in whatever hit `/draft` last.

5. **Instrumentation in production** — `INSTRUMENT_DEBUG` defaults off; good. Ensure deploy env doesn’t accidentally set it.

Overall for this codebase size, the intent variable is a reasonable, readable fix; the main residual risk is **multi-tenant** misuse of one shared variable.

## My engagement with each substantive point

| Point | Category | Response |
|-------|----------|----------|
| Global `latestDraftIntent` with multiple clients | **Context-irrelevant** | The assignment app is in-memory, single-tenant, and the regression test models one browser. Sharding by user would be the real fix in a multi-user product; out of scope here. |
| Intent vs committed `currentDraft` | **Real concern, addressed (documentation)** | The handler comment and instrumentation distinguish `currentDraftRead` vs `latestDraftIntentRead` so the trace shows publish follows intent. For this assignment, “mark the most recent saved draft” is interpreted as the latest save **request**, matching the professor’s bug description. |
| Alternative: await pending commits | **Style / preference** | Valid pattern for strict durability; heavier and unnecessary for the provided tests. I kept intent capture for simplicity and to avoid blocking publish on slow writes. |
| Validation / security | **Real concern, out of scope** | Same validation as starter; publish doesn’t widen the attack surface beyond what `/draft` already accepted. |
| `INSTRUMENT_DEBUG` in prod | **Real concern, addressed** | Instrumentation is opt-in via env; tests leave it unset so CI stays quiet. |

## What changed in the fix after review

No code changes. The review reinforced that `latestDraftIntent` is an intentional **intent snapshot** for this single-user exercise; the handler comments already distinguish committed storage from latest request intent.

If this were a multi-tenant service, the follow-up would be `latestDraftIntentByDocId` (or awaiting the save queue per document) — noted for future work, not required for the course test gate.
