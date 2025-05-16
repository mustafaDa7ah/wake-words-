// server.js - Node.js server for wake word detection using Vosk
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Readable } = require('stream');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Model, Recognizer } = require('vosk');

// Initialize the Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Load Vosk model - make sure to download this model to the specified path
const MODEL_PATH = path.join(__dirname, 'vosk-model-small-en-us-0.15');
let model;
try {
  model = new Model(MODEL_PATH);
  console.log('Vosk model loaded successfully');
} catch (error) {
  console.error('Failed to load Vosk model:', error);
  process.exit(1);
}

// Wake word configuration
const WAKE_WORD = "hey roomi";
const WAKE_WORD_ALTERNATIVES = [
  "hey roomi",
  "hi roomi",
  "hey roomie",
  "hey rumi",
  "hey roomy",
  "hey roaming",
  "hey romy",
  "hey rumi",
  "hey roma",
  "hey romey",
  "hiromi",   // Your logs showed this as a close match
  "hello roomi",
  "hello roomie",
  "hello rumi"
];
console.log(`Wake word set to: "${WAKE_WORD}" with ${WAKE_WORD_ALTERNATIVES.length} alternatives`);

// Function to check if detected text contains wake word
function containsWakeWord(text) {
  text = text.toLowerCase().trim();
  
  // Exact match first
  if (text.includes(WAKE_WORD)) {
    return true;
  }
  
  // Then check alternatives
  for (const alternative of WAKE_WORD_ALTERNATIVES) {
    if (text.includes(alternative)) {
      console.log(`Wake word alternative matched: "${alternative}"`);
      return true;
    }
  }
  
  // Check for close matches (fuzzy matching)
  // Word boundary then "hey" or "hi" followed by something starting with "r" and containing "m"
  const fuzzyPattern = /\b(hey|hi|hello)\s+r\w*m\w*/i;
  if (fuzzyPattern.test(text)) {
    console.log(`Fuzzy wake word match for: "${text}"`);
    return true;
  }
  
  return false;
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  // Create a new recognizer for each connection
  const recognizer = new Recognizer({
    model: model,
    sampleRate: 16000
  });
  
  recognizer.setMaxAlternatives(10);
  recognizer.setWords(true);
  
  ws.on('message', (message) => {
    try {
      // Check if message is binary (audio data)
      if (message instanceof Buffer) {
        // Process audio data with Vosk
        const isFinished = recognizer.acceptWaveform(message);
        
        // Process results even if not finished to get partial results
        const result = isFinished ? recognizer.result() : recognizer.partialResult();
        
        // Handle both partial and final results
        let transcript = '';
        if (result && result.text) {
          transcript = result.text.toLowerCase();
        } else if (result && result.partial) {
          transcript = result.partial.toLowerCase();
        }
        
        // Only log non-empty transcripts
        if (transcript && transcript.trim() !== '') {
          console.log(`${isFinished ? 'Final' : 'Partial'} speech detected:`, transcript);
          
           ws.send(JSON.stringify({ transcript }));

          // Check if wake word was detected
          if (containsWakeWord(transcript)) {
            console.log('Wake word detected!');
            ws.send(JSON.stringify({ wakeWordDetected: true }));
          }
        }
      } else {
        // Handle non-binary messages (likely control messages)
        try {
          const controlMessage = JSON.parse(message.toString());
          console.log('Received control message:', controlMessage);
          
          // Handle any control messages here if needed
        } catch (e) {
          console.log('Received non-binary, non-JSON message:', message.toString().substring(0, 100));
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      // Don't crash the server on error, just log it
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    try {
      recognizer.free();
    } catch (e) {
      console.error('Error freeing recognizer:', e);
    }
  });
  
  // Send initial confirmation
  ws.send(JSON.stringify({ status: 'connected' }));
});

// Basic route for testing the server
app.get('/', (req, res) => {
  res.send('Wake Word Detection Server is running');
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});