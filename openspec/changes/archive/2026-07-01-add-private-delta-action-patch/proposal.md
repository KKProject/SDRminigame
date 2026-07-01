# Change: add-private-delta-action-patch

## Why

Shared WebSocket delta messages currently clear `pendingActions` and `playerActions` to avoid leaking response candidates. That protects private action data, but it also means a player who enters a response window through the incremental path does not receive their own response buttons. In a concurrent response window, another player can submit a lower-priority action while the higher-priority player sees no button, leaving the server waiting for a decision that the client cannot make.

## What Changes

- Keep the public delta payload shared and free of private response action lists.
- Add a per-connection `privatePatch` to delta payloads that contains only the receiving player's own response actions.
- Include an explicit empty private action list for players who have no pending response actions, so stale buttons are cleared.
- Update the client delta reducer to apply `privatePatch.playerActions` after public patch updates.
- Add backend and client tests for personalized response actions in incremental delta broadcasts.

## Impact

- Normal public delta size stays small.
- Response-window buttons are restored without falling back to full snapshots.
- Other players cannot see a player's private response options.
