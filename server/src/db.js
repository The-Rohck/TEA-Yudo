const mysql = require('mysql2/promise');
require('dotenv').config();

// Pool compartido de conexiones MySQL/MariaDB para todos los endpoints del backend.
const connectionOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'tea_yudo',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const socketPath = process.env.INSTANCE_UNIX_SOCKET || process.env.DB_SOCKET_PATH;

if (socketPath) {
  delete connectionOptions.host;
  delete connectionOptions.port;
  connectionOptions.socketPath = socketPath;
}

const pool = mysql.createPool(connectionOptions);

module.exports = pool;
