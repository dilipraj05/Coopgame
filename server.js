const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const rooms = new Map();

wss.on("connection", (ws) => {
  let currentRoom = null, playerIndex = null;

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message); } catch (e) { return; }

    if (data.type === "create") {
      // 4-digit room code
      const roomId = Math.floor(1000 + Math.random() * 9000).toString();
      rooms.set(roomId, { players: [ws], creator: ws });
      currentRoom = roomId;
      playerIndex = 0;
      ws.send(JSON.stringify({ type: "roomCreated", roomId }));
    } else if (data.type === "join") {
      const room = rooms.get(data.roomId);
      if (!room || room.players.length >= 2) {
        ws.send(JSON.stringify({ type: "error", message: "Room full or not found" }));
        return;
      }
      room.players.push(ws);
      currentRoom = data.roomId;
      playerIndex = 1;
      // Tell both they're connected
      room.players.forEach((player, idx) =>
        player.send(JSON.stringify({ type: "joined", playerIndex: idx }))
      );
      // Start game when both are present
      if (room.players.length === 2) {
        room.players[0].send(JSON.stringify({ type: "start", role: "detective" }));
        room.players[1].send(JSON.stringify({ type: "start", role: "analyst" }));
      }
    } else if (data.type === "solvePuzzle") {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);
        const other = room.players[1 - playerIndex];
        if (other && other.readyState === WebSocket.OPEN) {
          other.send(JSON.stringify({ type: "partnerSolved", puzzleIndex: data.puzzleIndex }));
        }
      }
    } else if (data.type === "gameOver") {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom).players.forEach((p) =>
          p.send(JSON.stringify({ type: "gameOver" }))
        );
      }
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.players = room.players.filter((p) => p !== ws);
      if (room.players.length === 0) rooms.delete(currentRoom);
      else room.players[0].send(JSON.stringify({ type: "partnerLeft" }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));