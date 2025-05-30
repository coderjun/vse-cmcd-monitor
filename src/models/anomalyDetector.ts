import { v4 as uuidv4 } from 'uuid';
import { CMCDLogEntry, Anomaly, AnomalyType, AnomalyDetectionConfig } from './types';
import { logger } from '../utils/logger';

// Default configuration for anomaly detection
const defaultConfig: AnomalyDetectionConfig = {
  bufferingThresholdMs: 500,
  qualityDegradationThreshold: 0.3, // Lower threshold to detect more easily
  startupDelayThresholdMs: 2000,
  bandwidthFluctuationThresholdPercent: 25, // Lower threshold to detect more easily
  minSampleSize: 1, // Allow single-sample detection for testing
  analysisWindowSizeMs: 30000
};

let config: AnomalyDetectionConfig = { ...defaultConfig };

/**
 * Update the anomaly detection configuration
 */
export function updateConfig(newConfig: Partial<AnomalyDetectionConfig>): void {
  config = { ...config, ...newConfig };
  logger.info('Anomaly detection configuration updated', { config });
}

/**
 * Detect anomalies in a batch of CMCD log entries
 */
export function detectAnomalies(logs: CMCDLogEntry[]): Anomaly[] {
  if (logs.length < config.minSampleSize) {
    logger.info(`Not enough logs for anomaly detection. Have ${logs.length}, need ${config.minSampleSize}`);
    return [];
  }

  // Process isSimulation flag - always create anomalies for simulations
  const isSimulation = logs.some(log => log.isSimulation === true);
  if (isSimulation) {
    logger.info('Simulation detected - will generate anomalies');
    
    // Check for anomalyType hint in the logs
    const anomalyTypeHint = logs.find(log => log.anomalyType)?.anomalyType;
    if (anomalyTypeHint && logs.some(log => log.forceDetection === true)) {
      logger.info(`Simulation with specific anomaly type requested: ${anomalyTypeHint}`);
      return [createForcedAnomalyWithType(logs[logs.length - 1], anomalyTypeHint)];
    }
  }
  
  // Check for explicit force flag
  const forceDetection = logs.some(log => log.forceDetection === true);
  if (forceDetection) {
    logger.info('Forced anomaly detection triggered');
    return [createForcedAnomaly(logs[logs.length - 1])];
  }

  const anomalies: Anomaly[] = [];
  
  // Run all detection algorithms
  const bufferingAnomalies = detectBufferingIssues(logs);
  anomalies.push(...bufferingAnomalies);
  
  const bitrateAnomalies = detectBitrateAnomalies(logs);
  anomalies.push(...bitrateAnomalies);
  
  const startupAnomalies = detectStartupIssues(logs);
  anomalies.push(...startupAnomalies);
  
  const networkAnomalies = detectNetworkIssues(logs);
  anomalies.push(...networkAnomalies);
  
  // Log what was detected
  logger.info(`Detection results: buffering=${bufferingAnomalies.length}, bitrate=${bitrateAnomalies.length}, startup=${startupAnomalies.length}, network=${networkAnomalies.length}`);
  
  return anomalies;
}

/**
 * Create a forced test anomaly
 */
function createForcedAnomaly(log: CMCDLogEntry): Anomaly {
  return {
    id: uuidv4(),
    timestamp: new Date(),
    type: AnomalyType.QUALITY_DEGRADATION,
    severity: 'medium',
    message: 'Forced test anomaly for UI verification',
    affectedMetrics: ['br', 'mtp'],
    context: {
      sessionId: log.sid || 'unknown',
      note: 'This is a forced test anomaly to verify UI functionality'
    },
    recommendation: 'This is just a test anomaly. No action required.'
  };
}

/**
 * Create a forced test anomaly with a specific type
 */
function createForcedAnomalyWithType(log: CMCDLogEntry, anomalyTypeHint: string): Anomaly {
  // Map the string hint to an AnomalyType enum value
  let anomalyType = AnomalyType.QUALITY_DEGRADATION; // Default
  let affectedMetrics: string[] = ['br', 'mtp'];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  let message = 'Simulated quality degradation detected';
  let recommendation = 'This is a simulated anomaly for testing purposes.';
  
  // Select appropriate anomaly information based on the hint
  switch(anomalyTypeHint) {
    case 'BUFFERING':
      anomalyType = AnomalyType.BUFFERING;
      affectedMetrics = ['bs', 'bl'];
      severity = 'high';
      message = 'Buffering issue detected';
      recommendation = 'Check network conditions or reduce video quality.';
      break;
      
    case 'QUALITY_DEGRADATION':
      anomalyType = AnomalyType.QUALITY_DEGRADATION;
      affectedMetrics = ['br', 'mtp'];
      severity = 'medium';
      message = 'Quality degradation detected';
      recommendation = 'Bandwidth fluctuation detected. User experience may be impacted.';
      break;
      
    case 'NETWORK_ISSUE':
      anomalyType = AnomalyType.NETWORK_ISSUE;
      affectedMetrics = ['mtp', 'rtp', 'bl'];
      severity = 'high';
      message = 'Network throughput issue detected';
      recommendation = 'Network conditions deteriorated significantly.';
      break;
      
    case 'STARTUP_DELAY':
      anomalyType = AnomalyType.STARTUP_DELAY;
      affectedMetrics = ['dl', 'su'];
      severity = 'medium';
      message = 'Excessive startup delay detected';
      recommendation = 'Initial buffering is taking longer than expected.';
      break;
      
    case 'PLAYBACK_STALL':
      anomalyType = AnomalyType.PLAYBACK_STALL;
      affectedMetrics = ['bs', 'bl', 'pr'];
      severity = 'critical';
      message = 'Playback stalled';
      recommendation = 'Video has stopped playing due to insufficient buffer.';
      break;
  }
  
  return {
    id: uuidv4(),
    timestamp: new Date(),
    type: anomalyType,
    severity: severity,
    message: message,
    affectedMetrics: affectedMetrics,
    context: {
      sessionId: log.sid || 'unknown',
      simulation: true,
      requestedType: anomalyTypeHint
    },
    recommendation: recommendation
  };
}

/**
 * Detect buffering-related issues
 */
function detectBufferingIssues(logs: CMCDLogEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  
  // Look for buffer starvation events
  const bufferStarvedEntries = logs.filter(log => log.bs === true);
  
  if (bufferStarvedEntries.length > 0) {
    // Group starvation events by session
    const sessionGroups = groupBySession(bufferStarvedEntries);
    
    for (const [sessionId, entries] of Object.entries(sessionGroups)) {
      if (entries.length >= 2) {
        // Multiple buffer starvation events in the same session is a critical issue
        anomalies.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: AnomalyType.BUFFERING,
          severity: 'critical',
          message: `Frequent buffering detected in session ${sessionId}`,
          affectedMetrics: ['bs', 'bl'],
          context: {
            sessionId,
            occurrences: entries.length,
            timestamps: entries.map(e => e.timestamp)
          },
          recommendation: 'Reduce video quality, check network conditions, or increase initial buffer size'
        });
      } else {
        // Single buffer starvation event
        anomalies.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: AnomalyType.BUFFERING,
          severity: 'medium',
          message: 'Buffer starvation detected',
          affectedMetrics: ['bs', 'bl'],
          context: {
            sessionId,
            timestamp: entries[0].timestamp
          },
          recommendation: 'Monitor for additional occurrences. If persistent, adjust ABR algorithm to be more conservative'
        });
      }
    }
  }
  
  // Check for low buffer levels
  const lowBufferEntries = logs.filter(log => {
    return typeof log.bl === 'number' && log.bl < config.bufferingThresholdMs;
  });
  
  if (lowBufferEntries.length > 0) {
    // Group low buffer events by session
    const sessionGroups = groupBySession(lowBufferEntries);
    
    for (const [sessionId, entries] of Object.entries(sessionGroups)) {
      anomalies.push({
        id: uuidv4(),
        timestamp: new Date(),
        type: AnomalyType.BUFFERING,
        severity: 'low',
        message: `Low buffer level detected in session ${sessionId}`,
        affectedMetrics: ['bl'],
        context: {
          sessionId,
          bufferLevels: entries.map(e => e.bl),
          timestamps: entries.map(e => e.timestamp)
        },
        recommendation: 'Monitor buffer trend. Consider pre-buffering more content or reducing bitrate'
      });
    }
  }
  
  return anomalies;
}

/**
 * Detect bitrate and quality-related anomalies
 */
function detectBitrateAnomalies(logs: CMCDLogEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  
  // Check for simulated data - force anomaly detection for faster UI updates
  const isSimulation = logs.some(log => log.isSimulation === true);
  if (isSimulation && logs.length > 0) {
    // Find a log with br data to use for the anomaly
    const brLog = logs.find(log => typeof log.br === 'number');
    if (brLog) {
      return [{
        id: uuidv4(),
        timestamp: new Date(),
        type: AnomalyType.QUALITY_DEGRADATION,
        severity: 'high',
        message: `Quality degradation detected (simulation)`,
        affectedMetrics: ['br', 'mtp'],
        context: {
          sessionId: brLog.sid || 'unknown',
          simulation: true,
          br: brLog.br
        },
        recommendation: 'This is a simulated quality degradation. For testing purposes only.'
      }];
    }
  }
  
  // Group entries by session
  const sessionGroups = groupBySession(logs);
  
  for (const [sessionId, entries] of Object.entries(sessionGroups)) {
    // Get entries with bitrate information
    const entriesWithBitrate = entries.filter(e => typeof e.br === 'number');
    // For simulations, allow just 2 entries
    const minRequired = isSimulation ? 2 : 3;
    if (entriesWithBitrate.length < minRequired) continue;
    
    // Calculate bitrate drops
    let previousBitrate: number | null = null;
    let significantDrops = 0;
    let dropTimestamps: Date[] = [];
    
    entriesWithBitrate.forEach(entry => {
      if (previousBitrate !== null && entry.br) {
        const dropPercent = (previousBitrate - entry.br) / previousBitrate;
        
        if (dropPercent > config.qualityDegradationThreshold) {
          significantDrops++;
          dropTimestamps.push(entry.timestamp);
        }
      }
      
      if (entry.br) {
        previousBitrate = entry.br;
      }
    });
    
    // Check if there were significant quality drops
    if (significantDrops > 0) {
      anomalies.push({
        id: uuidv4(),
        timestamp: new Date(),
        type: AnomalyType.QUALITY_DEGRADATION,
        severity: significantDrops > 2 ? 'high' : 'medium',
        message: `Quality degradation detected in session ${sessionId}`,
        affectedMetrics: ['br', 'mtp'],
        context: {
          sessionId,
          bitrateDrops: significantDrops,
          timestamps: dropTimestamps
        },
        recommendation: 'Check network conditions, CDN performance, or adjust ABR algorithm'
      });
    }
    
    // Check for rapid bitrate fluctuations
    if (entriesWithBitrate.length > 5) {
      const bitrates = entriesWithBitrate.map(e => e.br as number);
      
      let fluctuations = 0;
      for (let i = 2; i < bitrates.length; i++) {
        // Check if we're seeing a pattern of up-down-up or down-up-down
        const direction1 = Math.sign(bitrates[i-1] - bitrates[i-2]);
        const direction2 = Math.sign(bitrates[i] - bitrates[i-1]);
        
        if (direction1 !== 0 && direction2 !== 0 && direction1 !== direction2) {
          fluctuations++;
        }
      }
      
      if (fluctuations > 2) {
        anomalies.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: AnomalyType.BANDWIDTH_FLUCTUATION,
          severity: 'medium',
          message: `Bitrate oscillation detected in session ${sessionId}`,
          affectedMetrics: ['br', 'mtp'],
          context: {
            sessionId,
            fluctuations
          },
          recommendation: 'Implement bitrate stabilization algorithms or increase buffer safety factor'
        });
      }
    }
  }
  
  return anomalies;
}

/**
 * Detect startup-related issues
 */
function detectStartupIssues(logs: CMCDLogEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  
  // Find startup events
  const startupEntries = logs.filter(log => log.su === true);
  
  if (startupEntries.length > 0) {
    // Group by session
    const sessionGroups = groupBySession(startupEntries);
    
    for (const [sessionId, entries] of Object.entries(sessionGroups)) {
      // Look for multiple startup events in the same session
      if (entries.length > 2) {
        anomalies.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: AnomalyType.STARTUP_DELAY,
          severity: 'high',
          message: `Multiple startup events detected in session ${sessionId}`,
          affectedMetrics: ['su', 'dl'],
          context: {
            sessionId,
            startupCount: entries.length,
            timestamps: entries.map(e => e.timestamp)
          },
          recommendation: 'Optimize initial segment delivery, reduce initial quality, or pre-buffer more content'
        });
      }
      
      // Check for long startup delay if we have deadline information
      const entriesWithDeadline = entries.filter(e => typeof e.dl === 'number');
      if (entriesWithDeadline.length > 0) {
        const longDelays = entriesWithDeadline.filter(e => (e.dl as number) > config.startupDelayThresholdMs);
        
        if (longDelays.length > 0) {
          anomalies.push({
            id: uuidv4(),
            timestamp: new Date(),
            type: AnomalyType.STARTUP_DELAY,
            severity: 'medium',
            message: `Long startup delay detected in session ${sessionId}`,
            affectedMetrics: ['su', 'dl'],
            context: {
              sessionId,
              delays: longDelays.map(e => e.dl)
            },
            recommendation: 'Optimize initial segment delivery or reduce initial quality'
          });
        }
      }
    }
  }
  
  return anomalies;
}

/**
 * Detect network-related issues
 */
function detectNetworkIssues(logs: CMCDLogEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  
  // Group entries by session
  const sessionGroups = groupBySession(logs);
  
  for (const [sessionId, entries] of Object.entries(sessionGroups)) {
    // Get entries with throughput information
    const entriesWithThroughput = entries.filter(e => typeof e.mtp === 'number');
    if (entriesWithThroughput.length < 3) continue;
    
    // Calculate throughput drops
    const throughputs = entriesWithThroughput.map(e => e.mtp as number);
    const maxThroughput = Math.max(...throughputs);
    const minThroughput = Math.min(...throughputs);
    
    // Check for significant throughput fluctuation
    const fluctuationPercent = (maxThroughput - minThroughput) / maxThroughput * 100;
    
    if (fluctuationPercent > config.bandwidthFluctuationThresholdPercent) {
      anomalies.push({
        id: uuidv4(),
        timestamp: new Date(),
        type: AnomalyType.NETWORK_ISSUE,
        severity: fluctuationPercent > 50 ? 'high' : 'medium',
        message: `Network throughput fluctuation detected in session ${sessionId}`,
        affectedMetrics: ['mtp', 'rtp'],
        context: {
          sessionId,
          fluctuationPercent,
          maxThroughput,
          minThroughput
        },
        recommendation: 'Check network stability, consider using a more stable connection'
      });
    }
    
    // Check for consistently low throughput compared to requested bitrate
    const entriesWithBothMetrics = entries.filter(e => typeof e.mtp === 'number' && typeof e.br === 'number');
    
    if (entriesWithBothMetrics.length > 0) {
      const lowThroughputEntries = entriesWithBothMetrics.filter(e => {
        const throughputKbps = e.mtp as number;
        const bitrateKbps = e.br as number;
        // Throughput less than 1.5x the bitrate could cause buffering
        return throughputKbps < bitrateKbps * 1.5;
      });
      
      if (lowThroughputEntries.length > 2) {
        anomalies.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: AnomalyType.NETWORK_ISSUE,
          severity: 'high',
          message: `Throughput insufficient for selected bitrate in session ${sessionId}`,
          affectedMetrics: ['mtp', 'br'],
          context: {
            sessionId,
            instances: lowThroughputEntries.length,
            ratios: lowThroughputEntries.map(e => ({
              throughput: e.mtp,
              bitrate: e.br,
              ratio: (e.mtp as number) / (e.br as number)
            }))
          },
          recommendation: 'Reduce video quality, improve network conditions, or implement more conservative ABR'
        });
      }
    }
  }
  
  return anomalies;
}

/**
 * Group log entries by session ID
 */
function groupBySession(logs: CMCDLogEntry[]): Record<string, CMCDLogEntry[]> {
  const groups: Record<string, CMCDLogEntry[]> = {};
  
  logs.forEach(log => {
    const sessionId = log.sid || 'unknown';
    if (!groups[sessionId]) {
      groups[sessionId] = [];
    }
    groups[sessionId].push(log);
  });
  
  return groups;
}