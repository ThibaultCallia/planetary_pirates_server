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
let rooms = new Map();

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  // ROOM CREATION
  socket.on('create-room', ({ roomName, roomPass, noOfPlayers }, callback) => {
    const roomCode = nanoid(6);
    console.log('create-room', roomCode, noOfPlayers);
    if (!rooms.has(roomName)) {
      // Store room data
      rooms.set(roomCode, { roomName, roomPass, noOfPlayers, players: [] });
      console.log(`Room ${roomName} created with code ${roomCode}`);

      // Send the roomCode back to the client
      callback(roomCode);
    } else {
      // Room code already exists
      console.log('Room name already exists');
      socket.emit('room-error', { message: 'Room name already exists' });

      // Send undefined to the client as the roomCode couldn't be generated
      callback(undefined);
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
          socket.emit('room-joined', { roomCode });
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
    console.log('user disconnected');
  });
});

const PORT = process.env.PORT || 9000;
myServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
