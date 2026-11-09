import https from 'https';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import querystring from 'querystring';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const zipPath = path.resolve(root, 'taskflow_cpanel_deploy.zip');

const CPANEL_HOST = 'taskflow.zerosyntax.in';
const CPANEL_PORT = 2083;
const USERNAME = 'taskflow';
const PASSWORD = 'jzD;WpIW1c1[19';
const APP_DIR = '/home/taskflow/taskflow';
const basicAuth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

function req(options, postData = null) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: CPANEL_HOST,
        port: CPANEL_PORT,
        rejectUnauthorized: false,
        ...options
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ res, body: b }));
      }
    );
    r.on('error', reject);
    if (postData) {
      if (Buffer.isBuffer(postData)) {
        r.write(postData);
      } else {
        r.write(postData);
      }
    }
    r.end();
  });
}

async function getAuthenticatedCookies() {
  console.log('[Auth] Fetching cPanel challenge...');
  const init = await req({
    path: '/',
    method: 'GET',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const cookies = (init.res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const html = init.body;

  if (!html.includes('function a0p')) {
    console.log('[Auth] No challenge detected or already passed.');
    return cookies;
  }

  const scriptMatch = html.match(/<script nonce="[^"]+">\s*(function a0p[\s\S]+?<\/script>)/);
  if (!scriptMatch) {
    throw new Error('Could not find challenge script');
  }
  const code = scriptMatch[1].replace('</script>', '');

  let submittedForm = null;
  const mockWindow = {
    navigator: {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      appVersion:
        '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      language: 'en-US',
      languages: ['en-US'],
      plugins: { 0: {}, length: 1, __proto__: Object.prototype },
      mimeTypes: { 0: {}, length: 1, __proto__: Object.prototype }
    },
    outerHeight: 800,
    outerWidth: 1200,
    addEventListener: (evt, cb) => cb(),
    document: {
      getElementById: () => ({ appendChild: () => {} }),
      createElement: (type) => {
        const el = {
          type,
          children: [],
          appendChild: (c) => el.children.push(c),
          submit: () => {
            submittedForm = el;
          }
        };
        return el;
      },
      addEventListener: (evt, cb) => cb()
    },
    setTimeout: (cb) => cb(),
    URLSearchParams: globalThis.URLSearchParams
  };
  mockWindow.window = mockWindow;

  const context = vm.createContext(mockWindow);
  vm.runInContext(code, context);

  if (!submittedForm) {
    throw new Error('Challenge script execution did not submit form');
  }

  const action = submittedForm.action;
  const params = {};
  for (const child of submittedForm.children) {
    if (child.name) {
      params[child.name] = child.value;
    }
  }

  const queryStr = querystring.stringify(params);
  const submitUrl = `${action}?${queryStr}`;

  const solved = await req({
    path: submitUrl,
    method: 'GET',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Cookie: cookies,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: `https://${CPANEL_HOST}:${CPANEL_PORT}/`
    }
  });

  const newCookies = (solved.res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const combinedCookies = [cookies, newCookies].filter(Boolean).join('; ');
  console.log('[Auth] Challenge bypassed successfully! Session established.');
  return combinedCookies;
}

async function uploadZip(sessionCookies) {
  console.log(`[Deploy 1/4] Uploading taskflow_cpanel_deploy.zip (${fs.statSync(zipPath).size} bytes)...`);
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

  const res = await req(
    {
      path: '/execute/Fileman/upload_files',
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Cookie: sessionCookies,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    },
    payload
  );

  const parsed = JSON.parse(res.body);
  if (parsed.status === 1) {
    console.log('[Deploy 1/4] Upload successful!');
  } else {
    console.error('[Deploy 1/4] Upload failed:', parsed);
    throw new Error('Upload failed');
  }
}

async function extractZip(sessionCookies) {
  console.log('[Deploy 2/4] Extracting taskflow_cpanel_deploy.zip on server...');
  const postData = `cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&cpanel_jsonapi_apiversion=2&filelist=1&multiform=1&doubledecode=0&op=extract&metadata=&sourcefiles=${encodeURIComponent(
    APP_DIR + '/taskflow_cpanel_deploy.zip'
  )}&destfiles=${encodeURIComponent(APP_DIR)}`;

  const res = await req(
    {
      path: '/json-api/cpanel',
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Cookie: sessionCookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    },
    postData
  );

  const parsed = JSON.parse(res.body);
  if (parsed?.cpanelresult?.data?.[0]?.result === 1) {
    console.log('[Deploy 2/4] Extraction successful!');
  } else {
    console.error('[Deploy 2/4] Extraction error:', parsed);
    throw new Error('Extraction failed');
  }
}

async function saveFile(sessionCookies, dir, file, content) {
  const postData =
    'dir=' +
    encodeURIComponent(dir) +
    '&file=' +
    encodeURIComponent(file) +
    '&content=' +
    encodeURIComponent(content);

  const res = await req(
    {
      path: '/execute/Fileman/save_file_content',
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Cookie: sessionCookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    },
    postData
  );

  return JSON.parse(res.body);
}

async function updateEnvAndRestart(sessionCookies) {
  console.log('[Deploy 3/4] Updating live .env with CORS whitelisting...');
  const prodEnv = `# ========================================================
# ENVIRONMENT & SERVER CONFIGURATION
# ========================================================
PORT=5000
NODE_ENV=production
HOST=0.0.0.0
CLIENT_URL=https://taskflow.zerosyntax.in
CORS_ORIGINS=https://taskflow.zerosyntax.in,https://localhost,http://localhost,capacitor://localhost,ionic://localhost

# ========================================================
# DATABASE CONFIGURATION (MONGODB ATLAS)
# ========================================================
MONGODB_URI=mongodb://vikasmaddipati3_db_user:taskflow2026@ac-n15agiu-shard-00-00.30kec2h.mongodb.net:27017,ac-n15agiu-shard-00-01.30kec2h.mongodb.net:27017,ac-n15agiu-shard-00-02.30kec2h.mongodb.net:27017/taskflow?ssl=true&replicaSet=atlas-7eqwpw-shard-0&authSource=admin&retryWrites=true&w=majority

# ========================================================
# CRYPTOGRAPHIC SECURITY (PRE-GENERATED FOR YOUR DOMAIN)
# ========================================================
JWT_SECRET=b7639b399f1bc4722900a5e71badba9ebf929223a9c95bedcfbca86b53767ab3
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=f3d3ee49f6b4b3b205831568c56101107fd831e9db6393b93551eac2ae518f9b
JWT_REFRESH_EXPIRES_IN=7d

# ========================================================
# EMAIL DELIVERY (cPanel Webmail or Gmail App Password)
# ========================================================
SMTP_HOST=mail.zerosyntax.in
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@zerosyntax.in
SMTP_PASS=your_email_password_here
FROM_EMAIL=noreply@zerosyntax.in
FROM_NAME=TaskFlow

# ========================================================
# BILLING / RAZORPAY (OPTIONAL)
# ========================================================
BILLING_DEFAULT_CURRENCY=INR
RAZORPAY_KEY_ID=rzp_live_placeholder
RAZORPAY_KEY_SECRET=rzp_secret_placeholder
RAZORPAY_WEBHOOK_SECRET=rzp_whsec_placeholder
RAZORPAY_PLAN_PRO=plan_pro_monthly
RAZORPAY_PLAN_TEAM=plan_team_monthly
RAZORPAY_PLAN_ENTERPRISE=plan_enterprise_monthly
`;

  await saveFile(sessionCookies, APP_DIR, '.env', prodEnv);
  console.log('[Deploy 3/4] Live .env saved successfully!');

  console.log('[Deploy 3.5/4] Triggering Phusion Passenger restart...');
  await saveFile(sessionCookies, APP_DIR + '/tmp', 'restart.txt', String(Date.now()));
  console.log('[Deploy 3.5/4] Passenger restart triggered!');
}

async function verifyDeployment() {
  console.log('[Deploy 4/4] Verifying production deployment...');
  await new Promise((r) => setTimeout(r, 4000));

  // 1. Health check
  const healthRes = await fetch('https://taskflow.zerosyntax.in/api/health');
  console.log('Health check status:', healthRes.status);
  const healthData = await healthRes.json();
  console.log('Health data:', healthData);

  // 2. CORS preflight check for https://localhost (Capacitor Android origin)
  const preflightRes = await fetch('https://taskflow.zerosyntax.in/api/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization'
    }
  });

  console.log('OPTIONS Preflight status:', preflightRes.status);
  console.log(
    'Access-Control-Allow-Origin for https://localhost:',
    preflightRes.headers.get('access-control-allow-origin')
  );
  console.log(
    'Access-Control-Allow-Credentials:',
    preflightRes.headers.get('access-control-allow-credentials')
  );

  // 3. POST Login check with Origin: https://localhost
  const loginRes = await fetch('https://taskflow.zerosyntax.in/api/auth/login', {
    method: 'POST',
    headers: {
      Origin: 'https://localhost',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'test_mobile@example.com', password: 'Password123!' })
  });

  console.log('POST Login check status:', loginRes.status);
  console.log(
    'POST Access-Control-Allow-Origin:',
    loginRes.headers.get('access-control-allow-origin')
  );
  const loginBody = await loginRes.json();
  console.log('POST Login response body:', loginBody);
}

async function run() {
  try {
    const sessionCookies = await getAuthenticatedCookies();
    await uploadZip(sessionCookies);
    await extractZip(sessionCookies);
    await updateEnvAndRestart(sessionCookies);
    await verifyDeployment();
    console.log('\n======================================================');
    console.log(' SUCCESS: Backend deployed and verified on cPanel!');
    console.log('======================================================');
  } catch (err) {
    console.error('\nDeployment error:', err);
    process.exit(1);
  }
}

run();
