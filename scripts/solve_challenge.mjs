import https from 'https';
import querystring from 'querystring';

const basicAuth = Buffer.from('taskflow:jzD;WpIW1c1[19').toString('base64');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'taskflow.zerosyntax.in',
        port: 2083,
        rejectUnauthorized: false,
        ...options
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ res, body }));
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function solve() {
  console.log('Fetching initial challenge...');
  const init = await request({
    path: '/',
    method: 'GET',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const cookies = (init.res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  console.log('Initial cookies:', cookies);

  // Extract variables from HTML
  const html = init.body;
  const oMatch = html.match(/o=['"](\/[^'"]+)['"]/);
  const tsMatch = html.match(/ts=['"]?(\d+)['"]?/);
  const idMatch = html.match(/id=['"]?([a-f0-9]+)['"]?/);
  const eMatch = html.match(/e=\+?\(([^;]+)\),d=/);
  const lMatch = html.match(/L=\+?\(([^;]+)\),i=/);

  if (!oMatch || !tsMatch || !eMatch || !lMatch) {
    console.log('Could not parse challenge or challenge passed:', html.slice(0, 300));
    return;
  }

  const o = oMatch[1];
  const ts = tsMatch[1];
  const id = idMatch ? idMatch[1] : '';

  // Evaluate e and L safely
  const eVal = Function(`return +(${eMatch[1]})`)();
  const lVal = Function(`return +(${lMatch[1]})`)();
  const wsidchk = String(eVal + lVal);

  console.log('Solved values:', { o, ts, id, wsidchk });

  const postParams = {
    wsidchk,
    pdata: 'https://taskflow.zerosyntax.in:2083/',
    ts,
    id,
    cttl: '0'
  };
  const postBody = querystring.stringify(postParams);

  console.log('Submitting challenge response to', o);
  const solved = await request(
    {
      path: o,
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Cookie: cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postBody),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://taskflow.zerosyntax.in:2083/'
      }
    },
    postBody
  );

  console.log('Solve response status:', solved.res.statusCode);
  console.log('Solve headers:', solved.res.headers);
  const newCookies = (solved.res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  console.log('New cookies:', newCookies);
}

solve().catch(console.error);
