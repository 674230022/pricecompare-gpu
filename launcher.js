const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, exec } = require('child_process');

const PORT = 3000;
const DB_PORT = 3307;

console.log('======================================');
console.log('       PriceCompare GPU');
console.log('======================================');
console.log('Starting...');

// --------------------------------------------------
// Environment
// --------------------------------------------------

process.env.NODE_ENV = 'development';
process.env.ENABLE_SCHEDULER = 'false';

process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = String(DB_PORT);
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'price_compare_db';

// --------------------------------------------------
// MariaDB paths
// --------------------------------------------------

const isPackaged = Boolean(process.pkg);

const bundledDbDir = isPackaged
  ? path.join(__dirname, 'portable-db')
  : path.join(process.cwd(), 'portable-db');

const runtimeRoot = path.join(
  process.env.LOCALAPPDATA || process.cwd(),
  'PriceCompareGPU'
);

const runtimeDbDir = path.join(runtimeRoot, 'portable-db');
const runtimeBinDir = path.join(runtimeDbDir, 'bin');
const runtimeDataDir = path.join(runtimeDbDir, 'data');

const mysqldPath = path.join(runtimeBinDir, 'mysqld.exe');

// --------------------------------------------------
// Copy Portable MariaDB to writable location
// --------------------------------------------------

function prepareMariaDB() {
  fs.mkdirSync(runtimeRoot, { recursive: true });

  if (!fs.existsSync(runtimeDbDir)) {
    console.log('[DB] Extracting Portable MariaDB...');
    fs.cpSync(bundledDbDir, runtimeDbDir, {
      recursive: true
    });
    console.log('[DB] MariaDB extracted.');
  }

  if (!fs.existsSync(runtimeDataDir)) {
    throw new Error('MariaDB data directory not found.');
  }

  if (!fs.existsSync(mysqldPath)) {
    throw new Error('mysqld.exe not found.');
  }
}

// --------------------------------------------------
// Check MariaDB
// --------------------------------------------------

function checkMariaDB(callback) {
  const mysqlPath = path.join(runtimeBinDir, 'mysql.exe');

  const test = spawn(
    mysqlPath,
    [
      '-u',
      'root',
      '-P',
      String(DB_PORT),
      '-h',
      '127.0.0.1',
      '-e',
      'SELECT 1;'
    ],
    {
      windowsHide: true
    }
  );

  let output = '';

  test.stdout.on('data', data => {
    output += data.toString();
  });

  test.on('close', code => {
    callback(code === 0);
  });

  test.on('error', () => {
    callback(false);
  });
}

// --------------------------------------------------
// Start MariaDB
// --------------------------------------------------

function startMariaDB() {
  return new Promise((resolve, reject) => {
    console.log('[DB] Checking MariaDB...');

    checkMariaDB(isRunning => {
      if (isRunning) {
        console.log('[DB] MariaDB already running.');
        resolve(null);
        return;
      }

      console.log('[DB] Starting MariaDB...');

      const dbProcess = spawn(
        mysqldPath,
        [
          `--datadir=${runtimeDataDir}`,
          `--port=${DB_PORT}`,
          '--bind-address=127.0.0.1',
          '--console'
        ],
        {
          cwd: runtimeDbDir,
          windowsHide: true
        }
      );

      dbProcess.on('error', error => {
        reject(error);
      });

      let attempts = 0;

      const timer = setInterval(() => {
        attempts++;

        checkMariaDB(isRunning => {
          if (isRunning) {
            clearInterval(timer);
            console.log('[DB] MariaDB is ready.');
            resolve(dbProcess);
          }

          if (attempts >= 30) {
            clearInterval(timer);
            reject(
              new Error('MariaDB did not start within 30 seconds.')
            );
          }
        });
      }, 1000);
    });
  });
}

// --------------------------------------------------
// Start Express
// --------------------------------------------------

function startServer() {
  console.log('[SERVER] Starting PriceCompare...');

  require('./src/app.js');

  waitForServer();
}

// --------------------------------------------------
// Wait for Express
// --------------------------------------------------

function waitForServer() {
  const req = http.get(
    `http://127.0.0.1:${PORT}`,
    () => {
      console.log('');
      console.log('======================================');
      console.log(' PriceCompare GPU is running!');
      console.log(` http://localhost:${PORT}`);
      console.log('======================================');

      exec(`start http://localhost:${PORT}`);
    }
  );

  req.on('error', () => {
    setTimeout(waitForServer, 1000);
  });

  req.setTimeout(1000, () => {
    req.destroy();
  });
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  try {
    prepareMariaDB();

    await startMariaDB();

    startServer();

  } catch (error) {
    console.error('');
    console.error('======================================');
    console.error(' ERROR');
    console.error('======================================');
    console.error(error.message);
    console.error('');

    process.exit(1);
  }
}

main();