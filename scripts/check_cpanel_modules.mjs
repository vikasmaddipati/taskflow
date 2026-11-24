import https from 'https';
import fs from 'fs';
import vm from 'vm';
import querystring from 'querystring';

const CPANEL_HOST = 'taskflow.zerosyntax.in';
const CPANEL_PORT = 2083;
const USERNAME = 'taskflow';
const PASSWORD = 'jzD;WpIW1c1[19';
const APP_DIR = '/home/taskflow/taskflow';
const basicAuth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

function req(options, postData = null) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      { hostname: CPANEL_HOST, port: CPANEL_PORT, rejectUnauthorized: false, ...options },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ res, body: b }));
      }
    );
    r.on('error', reject);
    if (postData) r.write(postData);
    r.end();
  });
}

async function getCookies() {
  const init = await req({
    path: '/',
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
  });
  const cookies = (init.res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const html = init.body;
  if (!html.includes('function a0p')) return cookies;
  const match = html.match(/<script nonce="[^"]+">\s*(function a0p[\s\S]+?<\/script>)/);
  const code = match[1].replace('</script>', '');
  let submittedForm = null;
  const mockWindow = {
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
  vm.runInContext(code, vm.createContext(mockWindow));
  const queryObj = {};
  for (const c of submittedForm.children) {
    if (c.name) queryObj[c.name] = c.value;
  }
  const queryStr = querystring.stringify(queryObj);
  const solved = await req({
    path: submittedForm.action + '?' + queryStr,
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}`, Cookie: cookies, 'User-Agent': 'Mozilla/5.0' }
  });
  const newCookies = (solved.res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  return [cookies, newCookies].filter(Boolean).join('; ');
}

async function listDir(cookies, dir) {
  const postData = 'dir=' + encodeURIComponent(dir) + '&need_check_owner=0';
  const res = await req(
    {
      path: '/execute/Fileman/list_files',
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Cookie: cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    },
    postData
  );
  return JSON.parse(res.body);
}

async function run() {
  const cookies = await getCookies();
  const list = await listDir(cookies, APP_DIR + '/node_modules');
  console.log('Total packages in /node_modules:', list?.data?.length);
  if (list?.data) {
    const names = list.data.map((d) => d.file);
    console.log('Sample node_modules:', names.slice(0, 30));
    console.log(
      'Has @innovatorssoft:',
      names.includes('@innovatorssoft'),
      'Has qrcode:',
      names.includes('qrcode')
    );
  }
}
run();
