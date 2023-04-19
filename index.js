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
  // console.log(socket);

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
      console.log('create-room', roomCode, noOfPlayers);
      // Store room data
      rooms.set(roomCode, {
        roomName,
        roomPass,
        noOfPlayers,
        players: [],
        gameState: initialGameState,
      });

      console.log(`Room ${roomName} created with code ${roomCode}`);
      socket.join(roomCode);
      //   Add player to room player array
      const playerData = {
        id: socket.id,
        roomCode,
      };
      const roomData = rooms.get(roomCode);
      roomData.players.push(playerData);
      playerToRoom.set(socket.id, roomCode);

      socket.emit(
        'room-created',
        { roomCode, maxPlayers: noOfPlayers, gameState: initialGameState },
        () => {
          io.in(roomCode).emit('player-joined', { playersJoined: 1 });
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
    console.log('join-room', roomName, roomPass);
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
      roomCode,
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
    console.log('Room joined', roomCode);
  });

  //   GAME ACTIONS
  socket.on('game-action', (action) => {
    const roomCode = playerToRoom.get(socket.id);
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
    console.log('game-action', action);
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    // socket.to(roomCode).emit('player-left', { playerId: socket.id });
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
