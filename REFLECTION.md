# Week 4 reflection

## 1. Why do we create a harness? Why not skip straight to “fix the bug” with AI?

A harness turns the race into something we can fire on demand with controlled timing, instead of clicking in the browser and hoping the network lines up. Building it forced me to spell out the exact sequence (save A, save B without waiting, publish) that the regression test encodes, so when I asked AI for a fix I could point at **`trace.txt`** as ground truth. Without that, “fix the race” stays vague and it’s easy to ship a change that passes once but doesn’t match the real failure mode.

## 2. Why is isolation important? Why not only run the full app manually?

The full UI adds noise—typing speed, browser quirks—and the bug depends on save latency versus publish. The harness hits the same HTTP surface as production but strips everything else out, so five runs look the same in the log. Isolation made the bug **deterministic**, which is what the rubric asks for and what makes the trace convincing to a TA who wasn’t in the room when I ran it.

## 3. How does modular design help? What if this were one giant handler?

Having separate `/draft` and `/publish` handlers with clear state (`currentDraft`, etc.) gave obvious places to log “enter,” “commit,” and “read.” If everything lived in one 500-line block, the race might still exist but we’d lack seams for instrumentation and we’d have to untangle control flow before proving ordering. Boundaries made both the harness and the logs smaller mental chunks.

## 4. What can review catch that tests cannot?

Tests here only assert the published string in two scenarios; they don’t judge whether we introduced **production risks**—for example using one global “intent” field for all users, operational misuse of debug logging, or awkward coupling between routes. Review is where someone asks “what did we assume about clients and storage?” even when CI is green.

## 5. Quote from review — why tests wouldn’t surface it

> **“Concurrent overlapping `/draft` requests from multiple clients — `latestDraftIntent` is one global string; last writer wins with no per-session isolation.”**

The regression suite never opens two sessions or two documents at once, so it would still pass if that design turned out to be wrong for a real product. A human reviewer still flags the **scaling boundary**: our fix is correct for the assignment’s single in-memory app but not automatically safe if we reused the same pattern in a multi-tenant API without scoping keys.
