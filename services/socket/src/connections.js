class ConnectionRegistry {
  constructor() {
    this.byId = new Map();
    this.byOpenid = new Map();
    this.byRoom = new Map();
    this.nextId = 1;
  }

  add(ws, openid) {
    const id = String(this.nextId++);
    const connection = {
      id,
      ws,
      openid,
      roomId: '',
      lastSeenAt: Date.now(),
      alive: true,
    };
    this.byId.set(id, connection);
    if (!this.byOpenid.has(openid)) this.byOpenid.set(openid, new Set());
    this.byOpenid.get(openid).add(connection);
    return connection;
  }

  subscribe(connection, roomId) {
    this.unsubscribe(connection);
    connection.roomId = roomId;
    if (!this.byRoom.has(roomId)) this.byRoom.set(roomId, new Set());
    this.byRoom.get(roomId).add(connection);
  }

  unsubscribe(connection) {
    if (!connection || !connection.roomId) return;
    const roomConnections = this.byRoom.get(connection.roomId);
    if (roomConnections) {
      roomConnections.delete(connection);
      if (!roomConnections.size) this.byRoom.delete(connection.roomId);
    }
    connection.roomId = '';
  }

  remove(connection) {
    if (!connection) return;
    this.unsubscribe(connection);
    this.byId.delete(connection.id);
    const openidConnections = this.byOpenid.get(connection.openid);
    if (openidConnections) {
      openidConnections.delete(connection);
      if (!openidConnections.size) this.byOpenid.delete(connection.openid);
    }
  }

  roomConnections(roomId) {
    return Array.from(this.byRoom.get(roomId) || []);
  }

  hasRoomConnection(openid, roomId) {
    return this.roomConnections(roomId).some((connection) => connection.openid === openid);
  }

  touch(connection) {
    if (!connection) return;
    connection.lastSeenAt = Date.now();
    connection.alive = true;
  }
}

module.exports = {
  ConnectionRegistry,
};
