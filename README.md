# Real-Time Streaming Media Anomaly Detector

A real-time pattern and anomaly detection system for streaming media logs, particularly focused on CMCD (Common Media Client Data) logs from video players.

## Features

- Real-time monitoring of streaming video playback quality
- Anomaly detection based on CMCD metrics
- Detection of buffering issues, quality degradation, network problems
- RESTful API for log submission and configuration
- Socket.io real-time notifications of detected anomalies
- Web interface for visualization and monitoring
- Test data generation for development and demonstration

## Technologies Used

- Node.js and TypeScript
- Express.js for API
- Socket.io for real-time communication
- Winston for logging
- CTA-5004 CMCD standard compliance

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd real-time-spike
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables (or use the defaults in `.env`)

4. Start the development server
```bash
npm run dev
```

### Usage

1. Access the web interface at http://localhost:3000
2. Use the "Generate Test Data" button to simulate streaming logs
3. View detected anomalies in real-time
4. Submit custom logs via the API or web interface

### API Endpoints

- `GET /health` - Health check endpoint
- `GET /api` - API documentation
- `POST /api/logs` - Submit CMCD logs for analysis
- `GET /api/config` - Get current anomaly detection configuration
- `PUT /api/config` - Update anomaly detection configuration
- `POST /api/test/generate` - Generate test data

## CMCD Standard

This project uses the CTA-5004 CMCD (Common Media Client Data) standard for streaming media metrics. The CMCD specification defines a standard set of media player performance metrics to be sent from clients to servers during streaming media playback.

Key CMCD metrics used in this project include:

- `br` - Encoded bitrate in kbps
- `bl` - Buffer length in milliseconds
- `bs` - Buffer starvation flag
- `mtp` - Measured throughput in kbps
- `d` - Object duration in milliseconds
- `dl` - Deadline in milliseconds
- `su` - Startup flag
- `sid` - Session ID
- `ot` - Object type

## Anomaly Detection

The system can detect several types of anomalies:

1. **Buffering Issues**
   - Buffer starvation events
   - Low buffer levels

2. **Quality Degradation**
   - Significant bitrate drops
   - Rapid bitrate fluctuations

3. **Startup Issues**
   - Multiple startup events in the same session
   - Long startup delays

4. **Network Issues**
   - Throughput fluctuations
   - Insufficient bandwidth for selected quality

## License

[ISC License](LICENSE)

## Acknowledgements

- CTA-5004 CMCD specification