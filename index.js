import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';

const app = express();
const myServer = http.createServer(app);
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://planetarypirates.surge.sh',
  'http://192.168.0.145:5173',
  'http://127.0.0.1:5173',
];

const io = new Server(myServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          'The CORS policy for this site does not allow access from the specified origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.static('public'));
const rooms = new Map();
const playerToRoom = new Map();

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  // ROOM CREATION
  socket.on(
    'create-room',
    ({ roomName, roomPass, noOfPlayers, initialGameState }, callback) => {
      const isRoomNameTaken = (newName) => {
        for (const roomData of rooms.values()) {
          if (roomData.roomName === newName) {
            return true;
          }
        }
        return false;
      };

      if (isRoomNameTaken(roomName)) {
        // Room code already exists
        console.log('Room name already exists');
        socket.emit('room-error', { message: 'Room name already exists' });
        return;
        // Send undefined to the client as the roomCode couldn't be generated?
      }

      const roomCode = nanoid(6);

      // Store room data
      rooms.set(roomCode, {
        roomName,
        roomPass,
        noOfPlayers,
        players: [],
        gameState: initialGameState,
      });

      socket.join(roomCode);
      //   Add player to room player array
      const playerData = {
        id: socket.id,
        socketId: socket.id,
        roomCode,
        disconnected: false,
      };
      const roomData = rooms.get(roomCode);
      roomData.players.push(playerData);
      playerToRoom.set(socket.id, roomCode);

      socket.emit(
        'room-created',
        {
          roomCode,
          maxPlayers: noOfPlayers,
          gameState: initialGameState,
          playerId: socket.id,
        },
        () => {
          io.in(roomCode).emit('player-joined', {
            playersJoined: 1,
            playerIds: [socket.id],
          });
        }
      );
      // Can this fail as the room hasn't been created yet?
      // io.in(roomCode).emit('player-joined', { playersJoined: 1 });
      // Send the roomCode back to the client
      callback(roomCode);
    }
  );

  // ROOM JOINING
  socket.on('join-room', ({ roomName, roomPass }) => {
    let roomCode;
    let roomData;

    // Find the room code associated with the room name
    for (const [code, data] of rooms.entries()) {
      if (data.roomName === roomName) {
        roomCode = code;
        roomData = data;
        break;
      }
    }
    // PLAYERS IN ROOM NOT YET ACCOUNTED FOR
    if (!roomData) {
      console.log('Room not found');
      socket.emit('room-error', { message: 'Password and/or name not known' });
      return;
    }

    if (roomData.roomPass !== roomPass) {
      console.log('Invalid password or room name');
      socket.emit('room-error', { message: 'Password and/or name not known' });
      return;
    }

    if (roomData.players.length >= roomData.noOfPlayers) {
      socket.emit('room-error', { message: 'Room is full' });
      return;
    }

    socket.join(roomCode);
    const playerData = {
      id: socket.id, // This can be replaced by the actual player's name
      socketId: socket.id,
      roomCode,
      disconnected: false,
    };
    roomData.players.push(playerData);
    playerToRoom.set(socket.id, roomCode);
    const playersJoined = roomData.players.length;
    const maxPlayers = roomData.noOfPlayers;
    const gameState = roomData.gameState;
    const playerIds = roomData.players.map((player) => player.id);
    socket.emit('room-joined', {
      roomCode,
      playersJoined,
      maxPlayers,
      gameState,
    });
    io.in(roomCode).emit('player-joined', { playersJoined, playerIds });
  });

  //   GAME ACTIONS
  // SOCKET ID WILL CHANGE UPON REFRESH
  socket.on('game-action', (action, playerId) => {
    const roomCode = playerToRoom.get(playerId);
    if (!roomCode) {
      console.log('player not found');
      socket.emit('error', { message: 'player not found' });
      return;
    }
    const room = rooms.get(roomCode);
    if (!room) {
      console.log('Room not found');
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    // below can also be socket.to in case  all players -  including this one - should get updates
    socket.to(roomCode).emit('game-action', action);
  });

  // UPDATING GAME STATE
  socket.on('update-game-state', ({ roomCode, newGameState }) => {
    const room = rooms.get(roomCode);
    if (room) {
      room.gameState = newGameState;
      rooms.set(roomCode, room);
    }
  });

  // ENDING TURN
  socket.on('end-turn', ({ roomCode }) => {
    const gameState = rooms.get(roomCode).gameState;
    socket.broadcast.to(roomCode).emit('sync-game-state', { gameState });
  });

  // REJOINING
  // Backend
  socket.on('rejoin-room', ({ playerId, roomCode }, callback) => {
    const roomData = rooms.get(roomCode);
    if (roomData) {
      // ONLY DISCONNECTED PLAYERS CAN REJOIN?
      const player = roomData.players.find((player) => player.id === playerId);
      if (player) {
        player.disconnected = false;
        player.socketId = socket.id;
        socket.join(roomCode);

        // Notify other players that the player has reconnected
        socket.to(roomCode).emit('player-reconnected', { playerId });

        callback({ success: true, roomData });
      } else {
        callback({ success: false, message: 'Player not found' });
      }
    } else {
      callback({ success: false, message: 'Room not found' });
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    const roomCode = playerToRoom.get(socket.id);

    if (roomCode) {
      const roomData = rooms.get(roomCode);
      if (roomData) {
        // Remove the player from the room's player list
        const disconnectedPlayerIndex = roomData.players.findIndex(
          (player) => player.socketId === socket.id
        );

        if (disconnectedPlayerIndex !== -1) {
          roomData.players[disconnectedPlayerIndex].disconnected = true;
        }

        socket
          .to(roomCode)
          .emit('player-disconnected', { playerId: socket.id });

        // Remove the room if there are no players left
        if (
          roomData.players.filter((player) => !player.disconnected).length === 0
        ) {
          rooms.delete(roomCode);
          console.log('Room deleted');
        } else {
          // Otherwise, UPDATE THE GAMES STATE?
        }
      }

      // Remove the player's socket ID from the playerToRoom Map
      playerToRoom.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 9000;
myServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
