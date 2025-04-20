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
export function generateTestData(count = 20, options: { oneTimeOnly?: boolean } = {}): CMCDLogEntry[] {
  const logs: CMCDLogEntry[] = [];
  const logProcessor = getLogProcessor();
  
  if (!logProcessor) {
    logger.error('Cannot generate test data: Log processor not initialized');
    return [];
  }
  
  // Always mark test data with simulation flag for proper handling
  const isTestData = true;
  
  // Limit count to avoid overloading the system
  const safeCount = Math.min(count, 10);
  logger.info(`Generating ${safeCount} individual logs and patterns (oneTimeOnly: ${options.oneTimeOnly})`);
  
  // Generate multiple patterns to trigger different types of anomalies
  
  // Session IDs for each pattern
  const bufferingSessionId = `buffering-${Math.random().toString(36).substring(2, 8)}`;
  const qualitySessionId = `quality-${Math.random().toString(36).substring(2, 8)}`;
  const networkSessionId = `network-${Math.random().toString(36).substring(2, 8)}`;
  const startupSessionId = `startup-${Math.random().toString(36).substring(2, 8)}`;
  
  // 1. BUFFERING pattern - will trigger BUFFERING and PLAYBACK_STALL anomalies
  const bufferingPattern = [
    {
      timestamp: new Date(),
      sid: bufferingSessionId,
      cid: `content-buffering-${Math.random().toString(36).substring(2, 8)}`,
      br: 5000,
      bl: 5000,
      mtp: 6000,
      playerState: 'playing' as 'playing',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 1,
      isSimulation: true,
      anomalyType: 'BUFFERING'
    },
    {
      timestamp: new Date(Date.now() + 1000),
      sid: bufferingSessionId,
      cid: `content-buffering-${Math.random().toString(36).substring(2, 8)}`,
      br: 5000,
      bl: 300, // Very low buffer
      mtp: 2200, // Not enough throughput
      playerState: 'buffering' as 'buffering',
      bs: true, // Buffer starvation flag
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 0,
      isSimulation: true,
      anomalyType: 'BUFFERING'
    },
    {
      timestamp: new Date(Date.now() + 2000),
      sid: bufferingSessionId,
      cid: `content-buffering-${Math.random().toString(36).substring(2, 8)}`,
      br: 3000, // Reduced bitrate due to buffering
      bl: 0, // Zero buffer
      mtp: 1200,
      playerState: 'buffering' as 'buffering',
      bs: true,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 0,
      isSimulation: true,
      forceDetection: true,
      anomalyType: 'BUFFERING'
    }
  ];
  
  // 2. QUALITY DEGRADATION pattern
  const qualityPattern = [
    {
      timestamp: new Date(Date.now() + 3000),
      sid: qualitySessionId,
      cid: `content-quality-${Math.random().toString(36).substring(2, 8)}`,
      br: 8000, // High quality
      bl: 6000,
      mtp: 10000,
      playerState: 'playing' as 'playing',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 1,
      isSimulation: true,
      anomalyType: 'QUALITY_DEGRADATION'
    },
    {
      timestamp: new Date(Date.now() + 4000),
      sid: qualitySessionId,
      cid: `content-quality-${Math.random().toString(36).substring(2, 8)}`,
      br: 3000, // Significant drop in quality
      bl: 5000,
      mtp: 4000,
      playerState: 'playing' as 'playing',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 1,
      isSimulation: true,
      anomalyType: 'QUALITY_DEGRADATION'
    },
    {
      timestamp: new Date(Date.now() + 5000),
      sid: qualitySessionId,
      cid: `content-quality-${Math.random().toString(36).substring(2, 8)}`,
      br: 800, // Extreme drop
      bl: 4000,
      mtp: 3000,
      playerState: 'playing' as 'playing',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 1,
      isSimulation: true,
      forceDetection: true,
      anomalyType: 'QUALITY_DEGRADATION'
    }
  ];
  
  // 3. NETWORK ISSUE pattern
  const networkPattern = [
    {
      timestamp: new Date(Date.now() + 6000),
      sid: networkSessionId,
      cid: `content-network-${Math.random().toString(36).substring(2, 8)}`,
      br: 5000,
      bl: 4000,
      mtp: 8000, // High throughput
      playerState: 'playing' as 'playing',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 1,
      isSimulation: true,
      anomalyType: 'NETWORK_ISSUE'
    },
    {
      timestamp: new Date(Date.now() + 7000),
      sid: networkSessionId,
      cid: `content-network-${Math.random().toString(36).substring(2, 8)}`,
      br: 5000, // Same bitrate
      bl: 3500,
      mtp: 2000, // Major throughput drop
      playerState: 'playing' as 'playing',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 1,
      isSimulation: true,
      forceDetection: true,
      anomalyType: 'NETWORK_ISSUE'
    }
  ];
  
  // 4. STARTUP DELAY pattern
  const startupPattern = [
    {
      timestamp: new Date(Date.now() + 8000),
      sid: startupSessionId,
      cid: `content-startup-${Math.random().toString(36).substring(2, 8)}`,
      br: 3000,
      bl: 0,
      dl: 5000, // High deadline (startup delay)
      mtp: 4000,
      playerState: 'buffering' as 'buffering',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 0,
      su: true, // Startup flag
      isSimulation: true,
      anomalyType: 'STARTUP_DELAY'
    },
    {
      timestamp: new Date(Date.now() + 9000),
      sid: startupSessionId,
      cid: `content-startup-${Math.random().toString(36).substring(2, 8)}`,
      br: 3000,
      bl: 2000,
      dl: 3000, // Still high deadline
      mtp: 4000,
      playerState: 'buffering' as 'buffering',
      bs: false,
      sf: 'h' as 'h',
      st: 'v' as 'v',
      pr: 0,
      su: true, // Startup flag
      isSimulation: true,
      forceDetection: true,
      anomalyType: 'STARTUP_DELAY'
    }
  ];
  
  // Combine all patterns into one guaranteed set
  const guaranteedPattern = [
    ...bufferingPattern,
    ...qualityPattern,
    ...networkPattern,
    ...startupPattern
  ];
  
  // Add the guaranteed pattern
  guaranteedPattern.forEach(log => {
    logs.push(log);
    logProcessor.addLogEntry(log);
  });
  
  // Generate some additional random logs if requested
  if (safeCount > 3) {
    for (let i = 0; i < safeCount - 3; i++) {
      const log = generateRandomLog();
      log.isSimulation = true;
      logs.push(log);
      logProcessor.addLogEntry(log);
    }
  }
  
  // We're already generating a comprehensive set of test data with the improved patterns above
  // No need for additional patterns
  
  logger.info(`Generated ${logs.length} total guaranteed test log entries`);
  return logs;
}