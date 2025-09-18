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
    console.log('✅ Connected to Finnhub WebSocket');
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    
    // Resubscribe to all active symbols
    activeSymbols.forEach(symbol => {
      console.log(`Resubscribing to ${symbol}`);
      
      // Subscribe to trades
      finnhubWs.send(JSON.stringify({
        'type': 'subscribe',
        'symbol': symbol
      }));
      
      // Subscribe to news
      finnhubWs.send(JSON.stringify({
        'type': 'subscribe',
        'symbol': symbol,
        'channel': 'news'
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
              source_api: 'finnhub_websocket',
              received_at: new Date().toISOString()
            });
            
            console.log(`✅ Sent to n8n: ${article.headline.substring(0, 50)}...`);
          } catch (error) {
            console.error('❌ Error sending to n8n:', error.message);
          }
        }
      }
      
      // Handle trade messages
      if (message.type === 'trade' && message.data) {
        // Log less frequently to reduce noise
        if (Math.random() < 0.01) { // Log 1% of trades
          console.log(`📊 Trade update for ${message.data[0].s}: $${message.data[0].p}`);
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
    timestamp: new Date().toISOString()
  });
});

// Subscribe to a single symbol
app.post('/subscribe/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  if (activeSymbols.size >= 50) {
    return res.status(400).json({
      error: 'Maximum 50 symbols allowed on free tier'
    });
  }
  
  if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
    // Subscribe to trades
    finnhubWs.send(JSON.stringify({
      'type': 'subscribe',
      'symbol': symbol
    }));
    
    // Subscribe to news
    finnhubWs.send(JSON.stringify({
      'type': 'subscribe',
      'symbol': symbol,
      'channel': 'news'
    }));
    
    activeSymbols.add(symbol);
    
    res.json({
      success: true,
      message: `Subscribed to ${symbol} (trades and news)`,
      active_symbols: Array.from(activeSymbols)
    });
  } else {
    res.status(503).json({
      error: 'WebSocket not connected'
    });
  }
});

// Bulk subscribe - replaces all subscriptions
app.post('/subscribe-bulk', (req, res) => {
  const { tickers } = req.body;
  
  console.log(`Bulk subscribe request for: ${tickers}`);
  
  if (!Array.isArray(tickers) || tickers.length > 50) {
    return res.status(400).json({
      error: 'Tickers must be an array with max 50 symbols'
    });
  }
  
  if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
    // Unsubscribe from all current symbols
    activeSymbols.forEach(symbol => {
      finnhubWs.send(JSON.stringify({
        'type': 'unsubscribe',
        'symbol': symbol
      }));
      
      finnhubWs.send(JSON.stringify({
        'type': 'unsubscribe',
        'symbol': symbol,
        'channel': 'news'
      }));
    });
    
    // Clear and set new symbols
    activeSymbols.clear();
    
    // Subscribe to new symbols (both trades and news)
    tickers.forEach(ticker => {
      const symbol = ticker.toUpperCase();
      
      console.log(`Subscribing to ${symbol} (trades and news)`);
      
      // Subscribe to trades
      finnhubWs.send(JSON.stringify({
        'type': 'subscribe',
        'symbol': symbol
      }));
      
      // Subscribe to news
      finnhubWs.send(JSON.stringify({
        'type': 'subscribe',
        'symbol': symbol,
        'channel': 'news'
      }));
      
      activeSymbols.add(symbol);
    });
    
    res.json({
      success: true,
      message: `Subscribed to ${tickers.length} symbols (trades and news)`,
      active_symbols: Array.from(activeSymbols)
    });
  } else {
    res.status(503).json({
      error: 'WebSocket not connected'
    });
  }
});

// Unsubscribe from a symbol
app.post('/unsubscribe/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
    finnhubWs.send(JSON.stringify({
      'type': 'unsubscribe',
      'symbol': symbol
    }));
    
    finnhubWs.send(JSON.stringify({
      'type': 'unsubscribe',
      'symbol': symbol,
      'channel': 'news'
    }));
    
    activeSymbols.delete(symbol);
    
    res.json({
      success: true,
      message: `Unsubscribed from ${symbol}`,
      active_symbols: Array.from(activeSymbols)
    });
  } else {
    res.status(503).json({
      error: 'WebSocket not connected'
    });
  }
});

// Clear all subscriptions
app.post('/unsubscribe-all', (req, res) => {
  if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
    activeSymbols.forEach(symbol => {
      finnhubWs.send(JSON.stringify({
        'type': 'unsubscribe',
        'symbol': symbol
      }));
      
      finnhubWs.send(JSON.stringify({
        'type': 'unsubscribe',
        'symbol': symbol,
        'channel': 'news'
      }));
    });
    
    activeSymbols.clear();
    
    res.json({
      success: true,
      message: 'Unsubscribed from all symbols',
      active_symbols: []
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
    max_allowed: 50,
    websocket_connected: finnhubWs && finnhubWs.readyState === WebSocket.OPEN
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Finnhub Bridge running on port ${PORT}`);
  console.log(`📡 Webhook URL: ${N8N_WEBHOOK_URL}`);
  console.log(`🔑 API Key: ${FINNHUB_API_KEY ? 'Configured' : 'Missing!'}`);
  
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
