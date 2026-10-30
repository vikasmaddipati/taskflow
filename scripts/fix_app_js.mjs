import https from 'https';

const basicAuth = Buffer.from('taskflow:jzD;WpIW1c1[19').toString('base64');

const appJsContent = `/**
 * TaskFlow - cPanel Phusion Passenger Startup Entrypoint
 */
import './src/server.js';
`;

function saveFile(dir, file, content) {
  return new Promise((resolve, reject) => {
    const postData = 'dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(file) + '&content=' + encodeURIComponent(content);
    const req = https.request({
      hostname: 'taskflow.zerosyntax.in',
      port: 2083,
      path: '/execute/Fileman/save_file_content',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0'
      },
      rejectUnauthorized: false
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('Writing app.js to /home/taskflow/taskflow...');
  const res1 = await saveFile('/home/taskflow/taskflow', 'app.js', appJsContent);
  console.log('Save app.js status:', res1.status === 1 ? 'SUCCESS' : res1);

  console.log('Touching restart.txt...');
  const res2 = await saveFile('/home/taskflow/taskflow/tmp', 'restart.txt', String(Date.now()));
  console.log('Restart status:', res2.status === 1 ? 'SUCCESS' : res2);
}

run().catch(console.error);
