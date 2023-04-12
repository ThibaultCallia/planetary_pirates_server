import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';

const app = express();
const myServer = http.createServer(app);
const io = new Server(myServer, {
  cors: {
    origin: 'http://localhost:5173',
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
  socket.on('create-room', ({ roomName, roomPass, noOfPlayers }, callback) => {
    const roomCode = nanoid(6);
    console.log('create-room', roomCode, noOfPlayers);
    if (!rooms.has(roomName)) {
      // Store room data
      rooms.set(roomCode, {
        roomName,
        roomPass,
        noOfPlayers,
        players: [],
        gameState: {},
      });
      console.log(`Room ${roomName} created with code ${roomCode}`);
      socket.join(roomCode);
      //   Add player to room player array
      const playerData = {
        id: socket.id,
        name: 'Player 1', // This can be replaced by the actual player's name
        roomCode,
      };
      const roomData = rooms.get(roomCode);
      roomData.players.push(playerData);

      playerToRoom.set(socket.id, roomCode);
      socket.emit('room-created', { roomCode, maxPlayers: noOfPlayers });
      io.in(roomCode).emit('player-joined', { playersJoined: 1 });
      // Send the roomCode back to the client
      callback(roomCode);
    } else {
      // Room code already exists
      console.log('Room name already exists');
      socket.emit('room-error', { message: 'Room name already exists' });

      // Send undefined to the client as the roomCode couldn't be generated?
    }
  });

  // ROOM JOINING
  socket.on('join-room', ({ roomName, roomPass }) => {
    let roomCode;
    let roomData;
    console.log(rooms.entries());
    // Find the room code associated with the room name
    for (const [code, data] of rooms.entries()) {
      if (data.roomName === roomName) {
        roomCode = code;
        roomData = data;
        break;
      }
    }
    // PLAYERS IN ROOM NOT YET ACCOUNTED FOR
    if (roomData) {
      if (roomData.roomPass === roomPass) {
        if (roomData.players.length < roomData.noOfPlayers) {
          socket.join(roomCode);
          const playerData = {
            id: socket.id,
            roomCode,
          };
          roomData.players.push(playerData);
          const playersJoined = roomData.players.length;
          const maxPlayers = roomData.noOfPlayers;
          socket.emit('room-joined', { roomCode, playersJoined, maxPlayers });
          io.in(roomCode).emit('player-joined', { playersJoined });
          console.log('Room joined', roomCode);
        } else {
          socket.emit('room-error', { message: 'Room is full' });
        }
      } else {
        console.log('Invalid password or room name');
        socket.emit('room-error', {
          message: 'Password and/or name not known',
        });
      }
    } else {
      console.log('Room not found');
      socket.emit('room-error', { message: 'Password and/or name not known' });
    }
  });

  //   GAME ACTIONS
  socket.on('game-action', ({ roomCode, action }) => {
    const room = rooms[roomCode];
    if (room) {
      // room.gameState = action;
      io.to(roomCode).emit('game-action', action);
    } else {
      console.log('Room not found');
      socket.emit('error', { message: 'Room not found' });
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
        roomData.players = roomData.players.filter(
          (player) => player.id !== socket.id
        );

        // Remove the room if there are no players left
        if (roomData.players.length === 0) {
          rooms.delete(roomCode);
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
