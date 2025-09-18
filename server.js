const WebSocket = require('ws');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Store active subscriptions
let activeSymbols = new Set();
let finnhubWs = null;
let reconnectInterval = null;

// Connect to Finnhub WebSocket
function connectWebSocket() {
  console.log('Connecting to Finnhub WebSocket...');
  
  finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);
  
  finnhubWs.on('open', function() {
    console.log('✅ Connected to Finnhub WebSocket (Fundamental-1 plan)');
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    
    // Resubscribe to all active symbols for NEWS
    activeSymbols.forEach(symbol => {
      console.log(`Subscribing to NEWS for ${symbol}`);
      finnhubWs.send(JSON.stringify({
        'type': 'subscribe-news',
        'symbol': symbol
      }));
    });
  });

  finnhubWs.on('message', async function(data) {
    try {
      const message = JSON.parse(data);
      console.log('Received message type:', message.type);
      
      // Handle news messages
      if (message.type === 'news' && message.data) {
        console.log(`📰 Received ${message.data.length} news articles`);
        
        for (const article of message.data) {
          try {
            await axios.post(N8N_WEBHOOK_URL, {
              title: article.headline,
              url: article.url,
              summary: article.summary,
              content: article.summary,
              published_date: new Date(article.datetime * 1000).toISOString(),
              source: article.source,
              related_tickers: article.related,
              category: article.category,
              finnhub_id: article.id,
              source_api: 'finnhub_websocket_news',
              received_at: new Date().toISOString()
            });
            
            console.log(`✅ Sent to n8n: ${article.headline.substring(0, 50)}...`);
          } catch (error) {
            console.error('❌ Error sending to n8n:', error.message);
          }
        }
      }
      
      // Handle ping messages
      if (message.type === 'ping') {
        finnhubWs.send(JSON.stringify({'type': 'pong'}));
      }
      
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  finnhubWs.on('error', function(error) {
    console.error('❌ WebSocket error:', error.message);
  });

  finnhubWs.on('close', function() {
    console.log('❌ WebSocket connection closed');
    finnhubWs = null;
    
    if (!reconnectInterval) {
      reconnectInterval = setInterval(() => {
        console.log('Attempting to reconnect...');
        connectWebSocket();
      }, 5000);
    }
  });
}

// API Endpoints

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    websocket_connected: finnhubWs && finnhubWs.readyState === WebSocket.OPEN,
    active_symbols: Array.from(activeSymbols),
    subscription_type: 'news',
    plan: 'fundamental-1',
    timestamp: new Date().toISOString()
  });
});

// Subscribe to a single symbol (NEWS ONLY)
const WebSocket = require('ws');
  const symbol = req.params.symbol.toUpperCase();
  
  if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
    finnhubWs.send(JSON.stringify({
      'type': 'unsubscribe-news',
      'symbol': symbol
    }));
    
    activeSymbols.delete(symbol);
    
    res.json({
      success: true,
      message: `Unsubscribed from NEWS for ${symbol}`,
      active_symbols: Array.from(activeSymbols)
    });
  } else {
    res.status(503).json({
      error: 'WebSocket not connected'
    });
  }
});

// Get all active subscriptions
app.get('/subscriptions', (req, res) => {
  res.json({
    active_symbols: Array.from(activeSymbols),
    count: activeSymbols.size,
    subscription_type: 'news',
    websocket_connected: finnhubWs && finnhubWs.readyState === WebSocket.OPEN
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Finnhub Bridge running on port ${PORT}`);
  console.log(`📡 Webhook URL: ${N8N_WEBHOOK_URL}`);
  console.log(`🔑 API Key: ${FINNHUB_API_KEY ? 'Configured' : 'Missing!'}`);
  console.log(`📰 Subscription Type: NEWS (Fundamental-1 plan)`);
  
  // Connect to WebSocket
  connectWebSocket();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing connections...');
  if (finnhubWs) {
    finnhubWs.close();
  }
  process.exit(0);
});
