# Implementation Notes

## Client State And Animation Entrypoints

`js/net/online.js` has four online state ingress paths:

- `applyServerSnapshot(res)` receives full snapshots from `pull()`, subscribe recovery, operation results, and ACK results. It now stores `authoritativeState`, optionally gates result display state, then forwards `res.animation.currentEvent` into the timeline.
- `applySocketDelta(message)` consumes WebSocket incremental updates. `stateOnly` deltas update authoritative/public-private fields without creating an animation. Event deltas build a display checkpoint and enqueue the event.
- `consumeAnimationState(animation, options)` is the compatibility boundary for old snapshot/delta callers. It no longer directly plays normal events; it routes them through `enqueueTimelineEvent()`, while still handling `selfAcked`, stale, and no-event cleanup cases.
- `finishAnimation(eventSeq)` is the only online animation completion point. It validates the current timeline event, commits its display checkpoint, releases animation locks, then sends an idempotent `ackAnimation`.

Fields that may update immediately:

- version, room metadata, rematch metadata, private hand/actions, response summary, pending actions, and response button state.

Fields gated by display checkpoints for result events:

- visible table phase, result panel state, settled scores, and other public table fields that would otherwise render before `hu`, `circle-loss`, or `draw-round` animation finishes.

The timeline state is stored on `OnlineController`:

- `timelineQueue`: queued authoritative public events sorted by `eventSeq`.
- `timelineCurrent`: the currently playing, fast-forwarding, or skipped event.
- `timelineConsumedEventSeqs`: recently consumed event sequence numbers for diagnostics and duplicate suppression.
- `authoritativeState`: latest server state mirror, separate from the current renderable `databus` state.
