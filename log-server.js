#!/usr/bin/env node
/**
 * log-server.js — Simple HTTP log receiver. POST JSON to /log, writes to debug-YYYY-MM-DD.log
 * Usage: node log-server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3005;

function getLogFilePath() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(__dirname, `debug-${date}.log`);
}

function appendLog(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(getLogFilePath(), line, 'utf8');
}

const server = http.createServer((req, res) => {
  // CORS for Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST' || req.url !== '/log') { res.writeHead(404); res.end(); return; }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const entry = JSON.parse(body);
      appendLog(entry);
      res.writeHead(200); res.end('ok');
    } catch {
      res.writeHead(400); res.end('bad json');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[log-server] Listening on http://localhost:${PORT}/log`);
  console.log(`[log-server] Writing to debug-${today}.log`);
});
