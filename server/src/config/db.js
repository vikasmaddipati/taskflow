import mongoose from 'mongoose';
import { exec } from 'child_process';
import fs from 'fs';

const LOCAL_URI = 'mongodb://127.0.0.1:27017/taskflow';
const MONGOD_PATH = '/home/taskflow/mongodb/bin/mongod';
const MONGOD_CONF = '/home/taskflow/mongodb/mongod.conf';

const ensureLocalMongoDaemon = () => {
  return new Promise((resolve) => {
    if (fs.existsSync(MONGOD_PATH) && fs.existsSync(MONGOD_CONF)) {
      console.error('[MongoDB DEBUG] Checking / starting local mongod daemon...');
      exec(`${MONGOD_PATH} --config ${MONGOD_CONF}`, (err, stdout, stderr) => {
        if (err) {
          console.error('[MongoDB DEBUG] mongod startup error/response:', stderr || err.message);
        } else {
          console.error('[MongoDB DEBUG] mongod daemon started:', stdout.trim());
        }
        resolve();
      });
    } else {
      console.error(`[MongoDB DEBUG] mongod not found at ${MONGOD_PATH}`);
      resolve();
    }
  });
};

const connectDB = async () => {
  let uri = process.env.MONGODB_URI;
  console.error('[MongoDB DEBUG] Initial raw process.env.MONGODB_URI:', uri);
  if (!uri || uri.includes('<username>') || uri.includes('yourmongodb.net') || uri.includes('30kec2h.mongodb.net')) {
    uri = LOCAL_URI;
  }
  console.error('[MongoDB DEBUG] Resolved URI:', uri);

  // Ensure local daemon is running if connecting to localhost
  if (uri.includes('127.0.0.1') || uri.includes('localhost')) {
    await ensureLocalMongoDaemon();
  }

  try {
    console.error('[MongoDB DEBUG] Calling mongoose.connect...');
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.error(`[MongoDB DEBUG] CONNECTED SUCCESSFULLY! Host: ${conn.connection.host}, database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB DEBUG] Connection error: ${error.message}`);

    // If initial connection failed on localhost, try launching daemon and retry
    if (fs.existsSync(MONGOD_PATH)) {
      await ensureLocalMongoDaemon();
      try {
        const retryConn = await mongoose.connect(LOCAL_URI, {
          serverSelectionTimeoutMS: 4000
        });
        console.log(`[MongoDB] Connected successfully after daemon start: ${retryConn.connection.host}`);
        return retryConn;
      } catch (retryErr) {
        console.error(`[MongoDB] Retry connection failed: ${retryErr.message}`);
      }
    }

    // Retry in background so Phusion Passenger does not fail with 503
    setTimeout(() => {
      connectDB().catch(() => {});
    }, 5000);
  }
};

export default connectDB;
