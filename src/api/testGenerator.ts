import { CMCDLogEntry } from '../models/types';
import { getLogProcessor } from '../utils/logProcessor';
import { logger } from '../utils/logger';

// Common streaming formats
const streamingFormats: ('d' | 'h' | 's' | 'o')[] = ['d', 'h', 's', 'o'];

// Object types
const objectTypes: ('m' | 'a' | 'v' | 'av' | 'i' | 'c' | 'tt' | 'k' | 'o')[] = ['m', 'a', 'v', 'av', 'i', 'c', 'tt', 'k', 'o'];

// Stream types (VOD or Live)
const streamTypes: ('v' | 'l')[] = ['v', 'l'];

// Common video bitrates in kbps
const bitrates = [300, 500, 1000, 2000, 3000, 4500, 6000, 8000];

// Generate a random session ID
function generateSessionId(): string {
  return `session-${Math.random().toString(36).substring(2, 10)}`;
}

// Generate a random content ID
function generateContentId(): string {
  return `content-${Math.random().toString(36).substring(2, 8)}`;
}

// Pick a random item from an array
function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Generate random integer between min and max
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate random boolean with probability
function randomBool(probability = 0.5): boolean {
  return Math.random() < probability;
}

/**
 * Generate a random CMCD log entry
 */
function generateRandomLog(sessionId?: string, contentId?: string): CMCDLogEntry {
  // Common parameters
  const sid = sessionId || generateSessionId();
  const cid = contentId || generateContentId();
  const br = randomItem(bitrates);
  const bl = randomInt(1000, 10000);
  const sf = randomItem(streamingFormats);
  const st = randomItem(streamTypes);
  const ot = randomItem(objectTypes);
  
  // Create base log
  const log: CMCDLogEntry = {
    timestamp: new Date(),
    sid,
    cid,
    br,
    bl,
    sf,
    st,
    ot
  };
  
  // Add optional fields with some probability
  if (randomBool(0.7)) {
    log.d = randomInt(2000, 10000); // Object duration
  }
  
  if (randomBool(0.5)) {
    log.mtp = randomInt(Math.max(br - 1000, 300), br + 3000); // Measured throughput
  }
  
  if (randomBool(0.2)) {
    log.bs = true; // Buffer starvation (occasionally)
  }
  
  if (randomBool(0.1)) {
    log.su = true; // Startup flag (rarely)
  }
  
  if (randomBool(0.5)) {
    log.pr = randomItem([0, 1, 1.5, 2]); // Playback rate
  }
  
  if (randomBool(0.3)) {
    log.dl = randomInt(500, 5000); // Deadline
  }
  
  if (randomBool(0.4)) {
    log.rtp = randomInt(br, br * 3); // Requested max throughput
  }
  
  // Extended fields for analysis (not part of CMCD spec)
  if (randomBool(0.8)) {
    log.playerState = randomItem(['playing', 'paused', 'buffering', 'ended']);
  }
  
  return log;
}

/**
 * Generate a sequence of related logs that show an anomaly pattern
 */
function generateAnomalyPattern(): CMCDLogEntry[] {
  const sessionId = generateSessionId();
  const contentId = generateContentId();
  const logs: CMCDLogEntry[] = [];
  const patternType = randomInt(1, 4);
  
  switch (patternType) {
    case 1: // Buffer starvation pattern
      // Start with normal playback
      for (let i = 0; i < 3; i++) {
        const log = generateRandomLog(sessionId, contentId);
        log.bl = 5000 - (i * 1500); // Decreasing buffer
        log.br = 3000;
        log.timestamp = new Date(Date.now() + (i * 1000));
        logs.push(log);
      }
      
      // Then buffer starvation
      for (let i = 0; i < 2; i++) {
        const log = generateRandomLog(sessionId, contentId);
        log.bl = 0;
        log.bs = true;
        log.playerState = 'buffering';
        log.timestamp = new Date(Date.now() + (3000 + i * 1000));
        logs.push(log);
      }
      
      // Recovery
      for (let i = 0; i < 2; i++) {
        const log = generateRandomLog(sessionId, contentId);
        log.bl = (i + 1) * 1000;
        log.br = 1000; // Lower bitrate after starvation
        log.playerState = 'playing';
        log.timestamp = new Date(Date.now() + (5000 + i * 1000));
        logs.push(log);
      }
      break;
      
    case 2: // Bitrate oscillation
      // Oscillating bitrate pattern
      const bitrateLevels = [6000, 3000, 6000, 2000, 5000, 2000];
      for (let i = 0; i < bitrateLevels.length; i++) {
        const log = generateRandomLog(sessionId, contentId);
        log.br = bitrateLevels[i];
        log.mtp = bitrateLevels[i] + randomInt(-500, 1000); // Throughput close to bitrate
        log.timestamp = new Date(Date.now() + (i * 1000));
        logs.push(log);
      }
      break;
      
    case 3: // Startup delay
      // Initial startup with high deadline
      for (let i = 0; i < 3; i++) {
        const log = generateRandomLog(sessionId, contentId);
        log.su = true;
        log.dl = 5000 - (i * 1000);
        log.playerState = i < 2 ? 'buffering' : 'playing';
        log.timestamp = new Date(Date.now() + (i * 1500));
        logs.push(log);
      }
      break;
      
    case 4: // Network throughput issues
      // Good throughput initially
      for (let i = 0; i < 2; i++) {
        const log = generateRandomLog(sessionId, contentId);
        log.br = 4000;
        log.mtp = 8000;
        log.timestamp = new Date(Date.now() + (i * 1000));
        logs.push(log);
      }
      
      // Sudden throughput drop
      for (let i = 0; i < 3; i++) {
        const log = generateRandomLog(sessionId, contentId);
        log.br = 4000;
        log.mtp = 2500; // Throughput below bitrate
        log.timestamp = new Date(Date.now() + (2000 + i * 1000));
        logs.push(log);
      }
      break;
  }
  
  return logs;
}

/**
 * Generate test data and send it to the log processor
 */
export function generateTestData(count = 20): CMCDLogEntry[] {
  const logs: CMCDLogEntry[] = [];
  const logProcessor = getLogProcessor();
  
  if (!logProcessor) {
    logger.error('Cannot generate test data: Log processor not initialized');
    return [];
  }
  
  // Generate some random individual logs
  for (let i = 0; i < count; i++) {
    const log = generateRandomLog();
    logs.push(log);
    logProcessor.addLogEntry(log);
  }
  
  // Generate a few anomaly patterns (2-3)
  const numPatterns = randomInt(2, 3);
  for (let i = 0; i < numPatterns; i++) {
    const patternLogs = generateAnomalyPattern();
    logs.push(...patternLogs);
    patternLogs.forEach(log => logProcessor.addLogEntry(log));
  }
  
  logger.info(`Generated ${logs.length} test log entries`);
  return logs;
}