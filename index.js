import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  // ROOM CREATION
  let rooms = {};
  socket.on('create-room', ({ roomCode, maxPlayers }) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        maxPlayers,
        players: [],
        gameState: null,
      };
      socket.join(roomCode);
      rooms[roomCode].players.push(socket.id);
      socket.emit('room-created', { roomCode });
    } else {
      socket.emit('error', { message: 'Room already exists' });
    }
  });

  // ROOM JOINING
  socket.on('join-room', (roomCode) => {
    const room = rooms[roomCode];

    if (room) {
      if (room.players.length < room.maxPlayers) {
        socket.join(roomCode);
        room.players.push(socket.id);
        socket.emit('room-joined', { roomCode });

        if (room.players.length === room.maxPlayers) {
          io.to(roomCode).emit('game-start');
        }
      } else {
        socket.emit('error', { message: 'Room is full' });
      }
    } else {
      socket.emit('error', { message: 'Room not found' });
    }
  });

  //   GAME ACTIONS
  socket.on('game-action', ({ roomCode, action }) => {
    const room = rooms[roomCode];
    if (room) {
      // room.gameState = action;
      io.to(roomCode).emit('game-action', action);
    } else {
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
