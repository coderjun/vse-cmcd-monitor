import express, { Request, Response } from 'express';
import { CMCDLogEntry } from '../models/types';
import { getLogProcessor } from '../utils/logProcessor';
import { updateConfig } from '../models/anomalyDetector';
import { logger } from '../utils/logger';
import { generateTestData } from './testGenerator';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export function setupRoutes(app: express.Application): void {
  /**
   * Health check endpoint
   */
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  /**
   * API documentation
   */
  app.get('/api', (req: Request, res: Response) => {
    res.status(200).json({
      version: '1.0.0',
      endpoints: [
        { path: '/health', method: 'GET', description: 'Health check endpoint' },
        { path: '/api', method: 'GET', description: 'API documentation' },
        { path: '/api/logs', method: 'POST', description: 'Submit CMCD logs for analysis' },
        { path: '/api/config', method: 'GET', description: 'Get current anomaly detection configuration' },
        { path: '/api/config', method: 'PUT', description: 'Update anomaly detection configuration' },
        { path: '/api/test/generate', method: 'POST', description: 'Generate test data' },
        { path: '/api/player/config', method: 'GET', description: 'Get player configuration' },
      ]
    });
  });
  
  /**
   * Get player configuration
   */
  app.get('/api/player/config', (req: Request, res: Response) => {
    res.status(200).json({
      defaultStreamUrl: process.env.DEFAULT_STREAM_URL || 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8'
    });
  });

  /**
   * Submit CMCD logs for analysis
   */
  app.post('/api/logs', (req: Request, res: Response) => {
    try {
      const logProcessor = getLogProcessor();
      if (!logProcessor) {
        return res.status(500).json({ error: 'Log processor not initialized' });
      }

      // Handle both single log and batch of logs
      const logs = Array.isArray(req.body) ? req.body : [req.body];
      
      // Validate logs
      const validLogs: CMCDLogEntry[] = [];
      
      for (const log of logs) {
        // Convert string timestamp to Date if needed
        if (typeof log.timestamp === 'string') {
          log.timestamp = new Date(log.timestamp);
        }
        
        // Add timestamp if missing
        if (!log.timestamp) {
          log.timestamp = new Date();
        }
        
        validLogs.push(log as CMCDLogEntry);
      }
      
      // Process each valid log
      validLogs.forEach(log => logProcessor.addLogEntry(log));
      
      logger.info(`Processed ${validLogs.length} log entries`);
      
      res.status(200).json({
        status: 'ok',
        processed: validLogs.length
      });
    } catch (error) {
      logger.error('Error processing logs', error);
      res.status(400).json({
        error: 'Invalid log format',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get current anomaly detection configuration
   */
  app.get('/api/config', (req: Request, res: Response) => {
    // We'll add this functionality after implementing configuration management
    res.status(501).json({ error: 'Not implemented yet' });
  });

  /**
   * Update anomaly detection configuration
   */
  app.put('/api/config', (req: Request, res: Response) => {
    try {
      // Validation would go here
      updateConfig(req.body);
      
      res.status(200).json({
        status: 'ok',
        message: 'Configuration updated'
      });
    } catch (error) {
      logger.error('Error updating configuration', error);
      res.status(400).json({
        error: 'Invalid configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  /**
   * Generate test data
   */
  app.post('/api/test/generate', (req: Request, res: Response) => {
    try {
      const count = req.body.count || 20;
      const oneTimeOnly = req.body.oneTimeOnly === true;
      
      logger.info(`Generating test data (count: ${count}, oneTimeOnly: ${oneTimeOnly})`);
      
      const logs = generateTestData(count, { oneTimeOnly });
      
      res.status(200).json({
        status: 'ok',
        generated: logs.length,
        oneTimeOnly: oneTimeOnly,
        message: `Generated ${logs.length} test log entries`
      });
    } catch (error) {
      logger.error('Error generating test data', error);
      res.status(500).json({
        error: 'Failed to generate test data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}