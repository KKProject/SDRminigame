# Design

## Overview

Delta broadcasts remain room-level for public fields, but the socket send loop personalizes a small private patch per connection. The public part continues to carry phase, current seat, feedback, response summary, and public append operations. The private part carries only the response actions produced by the authoritative engine for the target connection's seat.

## Server

`broadcastIncremental(roomId, res)` will compute the public incremental payload once. For each subscribed connection, it will derive a private patch from `res.public.responseSummary`, `res.public.pendingActions`, and that connection's seat. The seat can be taken from the operation result when broadcasting to the actor, or from `game.pull(connection.openid, roomId)` as a lightweight personalized view source when needed.

The private patch shape is:

```json
{
  "privatePatch": {
    "seat": 0,
    "playerActions": []
  }
}
```

When a response window is active and the target seat is still pending, `playerActions` contains that seat's actions plus a `pass` action. When the target seat has no pending action or has already decided, `playerActions` is `[]` so clients clear stale buttons.

The public patch will continue to avoid broadcasting concrete action lists. It should not expose `pendingActions` from the server public state.

## Client

The delta reducer will apply public patch first, then apply `privatePatch.playerActions` if present. Because the client keeps `mySeat` as the server seat and rotates action seats into local seat coordinates, the private patch actions need the same rotation as snapshot actions.

If a private patch is absent, existing behavior remains unchanged.

## Testing

- Backend: a response-window delta sent to two subscribers includes different `privatePatch.playerActions` for each connection and does not leak one player's private actions to the other.
- Client: applying a delta with `privatePatch.playerActions` restores local response buttons; applying an empty private patch clears stale response buttons.
