import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { setupRoutes } from './api/routes';
import { initializeLogProcessing } from './utils/logProcessor';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));

// Setup API routes
setupRoutes(app);

// Socket.io connection
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Start the log processing engine
initializeLogProcessing(io);

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export { app, server, io };