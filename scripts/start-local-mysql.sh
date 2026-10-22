#!/bin/bash
set -e

SOCKET="/tmp/mysql.sock"
DATADIR="/tmp/mysql-data"
PIDFILE="/tmp/mysqld.pid"
LOGFILE="/tmp/mysql.log"

if [ ! -d "$DATADIR/mysql" ]; then
  echo "Initializing MySQL datadir at $DATADIR..."
  mkdir -p "$DATADIR"
  /usr/sbin/mysqld --initialize-insecure --datadir="$DATADIR" --log-error="/tmp/mysql-init.log"
fi

if ! mysql --socket="$SOCKET" -u root -e "SELECT 1;" >/dev/null 2>&1; then
  echo "Starting mysqld on $SOCKET..."
  /usr/sbin/mysqld \
    --skip-networking \
    --mysqlx=OFF \
    --datadir="$DATADIR" \
    --socket="$SOCKET" \
    --pid-file="$PIDFILE" \
    --log-error="$LOGFILE" &
  
  # Wait for socket to become available
  for i in {1..30}; do
    if mysql --socket="$SOCKET" -u root -e "SELECT 1;" >/dev/null 2>&1; then
      echo "MySQL started successfully."
      break
    fi
    sleep 0.5
  done
else
  echo "MySQL is already running on $SOCKET."
fi

# Ensure dev database exists
mysql --socket="$SOCKET" -u root -e "CREATE DATABASE IF NOT EXISTS finance_dev;"
echo "Database finance_dev is ready."

