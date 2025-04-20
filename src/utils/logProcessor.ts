import { Server } from 'socket.io';
import { logger } from './logger';
import { detectAnomalies } from '../models/anomalyDetector';
import { CMCDLogEntry, AnomalyType } from '../models/types';

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

  // Keep track of simulation entries separately
  private simulationEntries: CMCDLogEntry[] = [];
  private lastSimulationProcessTime = 0;
  
  /**
   * Add a new log entry to the processing buffer
   */
  public addLogEntry(logEntry: CMCDLogEntry): void {
    // Special handling for simulation data
    if (logEntry.isSimulation === true) {
      logger.info(`Received simulation entry: ${JSON.stringify(logEntry)}`);
      
      // Add to simulation buffer
      this.simulationEntries.push(logEntry);
      
      // Track active session
      if (logEntry.sid) {
        this.io.emit('activeSessions', [logEntry.sid]);
      }
      
      // Process simulation entries if we have enough or if it's a forced detection
      const shouldProcess = logEntry.forceDetection === true || 
                           this.simulationEntries.length >= 3 ||
                           (Date.now() - this.lastSimulationProcessTime > 3000 && 
                            this.simulationEntries.length > 0);
      
      if (shouldProcess) {
        logger.info(`Processing ${this.simulationEntries.length} simulation entries`);
        
        // Force anomaly detection for simulation data
        const simulationData = [...this.simulationEntries];
        simulationData.forEach(entry => {
          entry.forceDetection = true; // Force detection
        });
        
        // Detect anomalies for the simulation batch
        const anomalies = detectAnomalies(simulationData);
        
        // If no anomalies detected, create a forced one
        if (anomalies.length === 0 && simulationData.length > 0) {
          logger.info('No anomalies detected for simulation, creating forced anomaly');
          const forcedAnomaly = {
            id: Math.random().toString(36).substring(2, 15),
            timestamp: new Date(),
            type: AnomalyType.QUALITY_DEGRADATION,
            severity: 'medium',
            message: 'Simulated quality degradation detected',
            affectedMetrics: ['br', 'mtp'],
            context: {
              sessionId: logEntry.sid || 'unknown',
              simulation: true
            },
            recommendation: 'Simulation test anomaly'
          };
          this.io.emit('anomalies', [forcedAnomaly]);
        } else if (anomalies.length > 0) {
          // Emit real anomalies
          logger.info(`Emitting ${anomalies.length} simulation anomalies`);
          this.io.emit('anomalies', anomalies);
        }
        
        // Clear simulation buffer and update timestamp
        this.simulationEntries = [];
        this.lastSimulationProcessTime = Date.now();
      }
      
      // Don't add simulation entries to the regular buffer
      return;
    }
    
    // Handle one-time entries differently
    if (logEntry.oneTimeOnly === true) {
      logger.info(`Processing one-time entry immediately: ${JSON.stringify(logEntry)}`);
      
      // For one-time-only entries, process immediately as a single item
      // This prevents them from being reprocessed multiple times in the buffer
      const oneTimeAnomalies = detectAnomalies([logEntry]);
      
      if (oneTimeAnomalies.length > 0) {
        logger.info(`Emitting ${oneTimeAnomalies.length} one-time anomalies immediately`);
        this.io.emit('anomalies', oneTimeAnomalies);
      }
      
      // Don't add to regular buffer, just handle the active session tracking
      if (logEntry.sid) {
        this.io.emit('activeSessions', [logEntry.sid]);
      }
      
      return;
    }
    
    // Regular entries go into the buffer for periodic processing
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
      // Filter out any oneTimeOnly entries that might have slipped through
      // This is a safety measure - they should be handled in addLogEntry
      this.buffer = this.buffer.filter(log => log.oneTimeOnly !== true);
      
      // Check if buffer still has entries after filtering
      if (this.buffer.length === 0) {
        return;
      }
      
      // Filter out simulation data from the buffer - we don't want to process these in batches
      const regularEntries = this.buffer.filter(log => log.isSimulation !== true);
      
      // Track active sessions from the buffer
      const sessionIds = new Set<string>();
      regularEntries.forEach(log => {
        if (log.sid) {
          sessionIds.add(log.sid);
        }
      });
      
      // Send active sessions to clients
      if (sessionIds.size > 0) {
        logger.info(`Active sessions: ${sessionIds.size}`);
        this.io.emit('activeSessions', Array.from(sessionIds));
      }
      
      // Only process regular (non-simulation) entries in batch
      logger.info(`Processing buffer with ${regularEntries.length} regular entries (${this.buffer.length - regularEntries.length} simulation entries filtered out)`);
      
      if (regularEntries.length === 0) {
        return; // Skip processing if only simulation entries were found
      }
      
      if (regularEntries.length > 0) {
        const sampleLog = regularEntries[regularEntries.length - 1];
        logger.info(`Sample log entry: ${JSON.stringify(sampleLog)}`);
      }
      
      // IMPORTANT: Create a copy of the entries to process, then clear the buffer
      // This ensures we don't process the same entries repeatedly
      const entriesToProcess = [...regularEntries];
      
      // Clear the buffer of all entries we're about to process
      // We're keeping only non-regular entries (simulations, etc.)
      this.buffer = this.buffer.filter(log => log.isSimulation === true);
      
      // Detect anomalies only in regular entries
      const anomalies = detectAnomalies(entriesToProcess);
      
      // Always log anomaly detection results
      logger.info(`Detected ${anomalies.length} anomalies from ${entriesToProcess.length} regular logs`);
      
      // Emit results to connected clients if anomalies found
      if (anomalies.length > 0) {
        logger.info(`Emitting ${anomalies.length} anomalies`);
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