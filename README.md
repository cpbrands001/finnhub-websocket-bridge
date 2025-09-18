# Finnhub WebSocket Bridge

Real-time news streaming from Finnhub to n8n workflow.

## Features
- Real-time news via WebSocket
- Support for up to 50 symbols (free tier)
- Auto-reconnect on connection loss
- REST API for managing subscriptions

## API Endpoints

- `GET /` - Health check
- `POST /subscribe/:symbol` - Subscribe to a symbol
- `POST /unsubscribe/:symbol` - Unsubscribe from a symbol
- `GET /subscriptions` - List active subscriptions

## Environment Variables

- `FINNHUB_API_KEY` - Your Finnhub API key
- `N8N_WEBHOOK_URL` - Your n8n webhook URL
- `PORT` - Server port (default: 3000)

## Deployment

Deployed on Railway with automatic restarts and health monitoring.
