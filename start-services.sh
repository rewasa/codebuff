#!/bin/bash

# Kill any existing processes
pkill -f "bun --cwd backend dev" || true
pkill -f "bun --cwd web dev" || true

# Start backend server in background
echo "Starting backend server..."
nohup bun start-server > backend.log 2>&1 &
backend_pid=$!

# Wait for backend to be ready (look for the ready message)
echo "Waiting for backend to be ready..."
while ! grep -q "Server is running on port" backend.log; do
  if ! kill -0 $backend_pid 2>/dev/null; then
    echo "Backend failed to start. Check backend.log for details."
    exit 1
  fi
  sleep 1
done

# Start web server in background
echo "Starting web server..."
nohup bun start-web > web.log 2>&1 &
web_pid=$!

# Wait for web server to be ready
echo "Waiting for web server to be ready..."
while ! grep -q "Ready in" web.log; do
  if ! kill -0 $web_pid 2>/dev/null; then
    echo "Web server failed to start. Check web.log for details."
    exit 1
  fi
  sleep 1
done

echo "All services started!"
echo "Backend PID: $backend_pid"
echo "Web PID: $web_pid"
echo "Logs are in backend.log and web.log"