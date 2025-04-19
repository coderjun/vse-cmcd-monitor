import { Server } from 'socket.io';
import { logger } from './logger';
import { detectAnomalies } from '../models/anomalyDetector';
import { CMCDLogEntry } from '../models/types';

/**
 * Process incoming CMCD log entries in real-time
 */
class LogProcessor {
  private io: Server;
  private buffer: CMCDLogEntry[] = [];
  private bufferSize: number = 100;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Add a new log entry to the processing buffer
   */
  public addLogEntry(logEntry: CMCDLogEntry): void {
    this.buffer.push(logEntry);
    
    // Trim buffer if it exceeds max size
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Start processing log entries at regular intervals
   */
  public startProcessing(intervalMs: number = 1000): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(() => this.processBuffer(), intervalMs);
    logger.info(`Log processing started with interval: ${intervalMs}ms`);
  }

  /**
   * Stop processing log entries
   */
  public stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Log processing stopped');
    }
  }

  /**
   * Process the current buffer of log entries
   */
  private processBuffer(): void {
    if (this.buffer.length === 0) {
      return;
    }

    try {
      // Detect anomalies in the current buffer
      const anomalies = detectAnomalies(this.buffer);
      
      // Emit results to connected clients if anomalies found
      if (anomalies.length > 0) {
        logger.info(`Detected ${anomalies.length} anomalies`);
        this.io.emit('anomalies', anomalies);
      }
    } catch (error) {
      logger.error('Error processing log buffer:', error);
    }
  }
}

// Singleton instance
let logProcessor: LogProcessor | null = null;

/**
 * Initialize the log processing engine
 */
export function initializeLogProcessing(io: Server): LogProcessor {
  if (!logProcessor) {
    logProcessor = new LogProcessor(io);
    logProcessor.startProcessing();
  }
  return logProcessor;
}

/**
 * Get the log processor instance
 */
export function getLogProcessor(): LogProcessor | null {
  return logProcessor;
}