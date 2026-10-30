import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const zipPath = path.resolve(__dirname, '../taskflow_cpanel_deploy.zip');

const CPANEL_HOST = 'taskflow.zerosyntax.in';
const CPANEL_PORT = 2083;
const USERNAME = 'taskflow';
const PASSWORD = 'jzD;WpIW1c1[19';
const APP_DIR = '/home/taskflow/taskflow';

const basicAuth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

console.log('====================================================');
console.log(' Starting TaskFlow Automated cPanel Deployment');
console.log(` Target: https://${CPANEL_HOST}:${CPANEL_PORT}`);
console.log(` Account: ${USERNAME}`);
console.log('====================================================\n');

async function uapi(endpoint, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const isPost = data !== null;
    const reqHeaders = {
      'Authorization': `Basic ${basicAuth}`,
      ...headers
    };

    const req = https.request(
      {
        hostname: CPANEL_HOST,
        port: CPANEL_PORT,
        path: `/execute/${endpoint}`,
        method: isPost ? 'POST' : 'GET',
        headers: reqHeaders,
        rejectUnauthorized: false
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            resolve({ raw: body, statusCode: res.statusCode });
          }
        });
      }
    );

    req.on('error', reject);

    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'string') {
        req.write(data);
      }
    }
    req.end();
  });
}

async function uploadZip() {
  console.log(`[1/4] Uploading taskflow_cpanel_deploy.zip (${fs.statSync(zipPath).size} bytes)...`);
  
  const boundary = '----TaskFlowDeploymentBoundary' + Date.now();
  const fileData = fs.readFileSync(zipPath);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="dir"\r\n\r\n${APP_DIR}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="overwrite"\r\n\r\n1\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file-1"; filename="taskflow_cpanel_deploy.zip"\r\n` +
    `Content-Type: application/zip\r\n\r\n`
  );

  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([header, fileData, footer]);

  const res = await uapi('Fileman/upload_files', payload, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': payload.length
  });

  if (res.status === 1) {
    console.log('[1/4] Upload successful!');
  } else {
    console.error('[1/4] Upload failed:', res.errors || res);
    throw new Error('Upload failed');
  }
}

async function extractZip() {
  console.log('[2/4] Extracting archive on server...');
  const postData = `cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&cpanel_jsonapi_apiversion=2&filelist=1&multiform=1&doubledecode=0&op=extract&metadata=&sourcefiles=${encodeURIComponent(APP_DIR + '/taskflow_cpanel_deploy.zip')}&destfiles=${encodeURIComponent(APP_DIR)}`;

  const res = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: CPANEL_HOST,
      port: CPANEL_PORT,
      path: '/json-api/cpanel',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      rejectUnauthorized: false
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  if (res?.cpanelresult?.data?.[0]?.result === 1) {
    console.log('[2/4] Extraction successful!');
  } else {
    console.error('[2/4] Extraction error:', res);
    throw new Error('Extraction failed');
  }
}

async function restartPassenger() {
  console.log('[3/4] Triggering Phusion Passenger application reload...');
  const res = await uapi(
    `Fileman/save_file_content?dir=${encodeURIComponent(APP_DIR + '/tmp')}&file=restart.txt&content=${Date.now()}`,
    ''
  );
  if (res.status === 1) {
    console.log('[3/4] Passenger reload signal dispatched!');
  } else {
    console.warn('[3/4] Warning updating restart.txt:', res.errors);
  }
}

async function verifyDeployment() {
  console.log('[4/4] Verifying application endpoints...');
  // Give Passenger a couple seconds to re-spawn
  await new Promise((r) => setTimeout(r, 4000));

  const checkEndpoint = (urlPath) => {
    return new Promise((resolve) => {
      const req = https.get(
        {
          hostname: CPANEL_HOST,
          port: 443,
          path: urlPath,
          rejectUnauthorized: false,
          headers: {
            'User-Agent': 'TaskFlow-Deploy-Verifier/1.0'
          }
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body.substring(0, 300)
            });
          });
        }
      );
      req.on('error', (err) => resolve({ error: err.message }));
      req.setTimeout(8000, () => req.destroy());
    });
  };

  const rootCheck = await checkEndpoint('/');
  console.log(`- Web Frontend (/) status: ${rootCheck.statusCode}`);

  const healthCheck = await checkEndpoint('/api/health');
  console.log(`- API Health (/api/health) status: ${healthCheck.statusCode}`);
  if (healthCheck.body) {
    console.log(`  Health response: ${healthCheck.body}`);
  }
}

async function run() {
  try {
    await uploadZip();
    await extractZip();
    await restartPassenger();
    await verifyDeployment();
    console.log('\nDeployment process completed successfully!');
  } catch (err) {
    console.error('\nDeployment halted:', err.message);
  }
}

run();
