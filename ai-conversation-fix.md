# AI conversation — fix step (fix cites `trace.txt`)

**User**

I’m debugging a small Express app. I added a harness and server-side logging, then saved the output to `trace.txt` in the repo (from the still-broken code). Please read that file and fix the race so the course regression test passes.

The key lines in the trace are the ordering of `draft:enter` for draft B, then `publish:enter` / `publish:exit` *before* `draft:commit` for B. In the broken version, `publish:exit` shows `publishedDraft` is `draft A` even though the in-flight save is for `draft B`, and the GETs at the end show `current` is B but `published` stayed A. The fix has to make publish respect the **latest save request**, not just what `currentDraft` had at the moment of publish.

**Assistant**

From `trace.txt`, the race is clear:

- `draft:enter` for B is at `...21.465Z` with `bodyContent: "draft B"`.
- `publish:enter` at `...21.466Z` still has `currentDraftRead: "draft A"` because B’s `setTimeout` has not committed.
- `publish:exit` sets `publishedDraft` to that stale `currentDraft` value (`draft A`).
- B’s `draft:commit` only runs at `...21.766Z` — after publish already ran.

So the bug is that `/publish` reads **committed** state only. A minimal fix is to track the **latest requested** draft text synchronously when `/draft` is accepted (before the artificial delay), e.g. `latestDraftIntent`, update it on each `/draft`, clear it on `/reset`, and set `publishedDraft = latestDraftIntent` in `/publish`. That matches the trace evidence: publish runs before B commits but still sees `latestDraftIntent === "draft B"` because B’s handler ran first and updated intent.

I’ll implement that in `app/server.js` and keep the instrumentation logging `latestDraftIntentRead` on publish so a post-fix harness run shows publish choosing B while `currentDraftRead` can still be A.

---

_(End of saved session — code changes applied in `app/server.js` as described.)_
