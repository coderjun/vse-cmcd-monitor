/**
 * Common Media Client Data (CMCD) log entry
 * Based on CTA-5004 specification
 */
export interface CMCDLogEntry {
  // Timestamp when the log was created
  timestamp: Date;
  
  // Session ID
  sid?: string; // Session ID - GUID identifying the current playback session

  // Content ID
  cid?: string; // Content ID - unique string identifying the current content
  
  // CMCD fields as per CTA-5004 specification
  br?: number;  // Encoded bitrate in kbps
  bl?: number;  // Buffer length in milliseconds
  bs?: boolean; // Buffer starvation flag
  d?: number;   // Object duration in milliseconds
  dl?: number;  // Deadline in milliseconds
  mtp?: number; // Measured throughput in kbps
  nor?: string; // Next object request - relative path
  nrr?: string; // Next range request
  ot?: 'm' | 'a' | 'v' | 'av' | 'i' | 'c' | 'tt' | 'k' | 'o'; // Object type
  pr?: number;  // Playback rate (1 if real-time, 2 if double speed, 0 if not playing)
  rtp?: number; // Requested maximum throughput in kbps
  sf?: 'd' | 'h' | 's' | 'o'; // Streaming format (DASH, HLS, Smooth, other)
  st?: 'v' | 'l'; // Stream type (VOD or LIVE)
  su?: boolean; // Startup flag - if the object is urgently needed due to startup/seeking/recovery
  tb?: number;  // Top bitrate - highest bitrate rendition available in kbps
  v?: number;   // CMCD version
  
  // Extended fields for analysis (not part of CMCD spec but useful for analysis)
  resolution?: string;        // Video resolution (e.g., "1920x1080")
  playerState?: 'playing' | 'paused' | 'buffering' | 'ended';
  errorCode?: string;         // Any error code reported
  latency?: number;           // Network latency in ms
  
  // Raw headers/data for additional processing
  rawData?: Record<string, any>;
}

/**
 * Represents a detected anomaly
 */
export interface Anomaly {
  id: string;
  timestamp: Date;
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  affectedMetrics: string[];
  context: Record<string, any>;
  recommendation?: string;
}

/**
 * Types of anomalies that can be detected
 */
export enum AnomalyType {
  BUFFERING = 'buffering',
  QUALITY_DEGRADATION = 'quality_degradation',
  NETWORK_ISSUE = 'network_issue',
  PLAYER_ERROR = 'player_error',
  PLAYBACK_STALL = 'playback_stall',
  STARTUP_DELAY = 'startup_delay',
  ABNORMAL_BITRATE = 'abnormal_bitrate',
  BANDWIDTH_FLUCTUATION = 'bandwidth_fluctuation',
  CDN_ISSUE = 'cdn_issue',
  SEGMENT_ERROR = 'segment_error'
}

/**
 * Configuration for anomaly detection thresholds
 */
export interface AnomalyDetectionConfig {
  bufferingThresholdMs: number;
  qualityDegradationThreshold: number;
  startupDelayThresholdMs: number;
  bandwidthFluctuationThresholdPercent: number;
  minSampleSize: number;
  analysisWindowSizeMs: number;
}