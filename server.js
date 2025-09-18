// Bulk subscribe - replaces all subscriptions
app.post('/subscribe-bulk', (req, res) => {
  const { tickers } = req.body; // ["AAPL", "NVDA", "MSFT"]
  
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
    });
    
    // Clear and set new symbols
    activeSymbols.clear();
    
    // Subscribe to new symbols
    tickers.forEach(ticker => {
      const symbol = ticker.toUpperCase();
      finnhubWs.send(JSON.stringify({
        'type': 'subscribe',
        'symbol': symbol
      }));
      activeSymbols.add(symbol);
    });
    
    res.json({
      success: true,
      message: `Subscribed to ${tickers.length} symbols`,
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
