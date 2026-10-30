import https from 'https';

const basicAuth = Buffer.from('taskflow:jzD;WpIW1c1[19').toString('base64');

const newEnv = `# ========================================================
# ENVIRONMENT & SERVER CONFIGURATION
# ========================================================
PORT=5000
NODE_ENV=production
HOST=0.0.0.0
CLIENT_URL=https://taskflow.zerosyntax.in

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
        'Content-Length': Buffer.byteLength(postData)
      },
      rejectUnauthorized: false
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve({ raw: d });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('Writing live MongoDB Atlas URI to cPanel .env...');
  const res1 = await saveFile('/home/taskflow/taskflow', '.env', newEnv);
  console.log('Save .env status:', res1.status === 1 ? 'SUCCESS' : res1);

  console.log('Restarting Phusion Passenger application...');
  const res2 = await saveFile('/home/taskflow/taskflow/tmp', 'restart.txt', String(Date.now()));
  console.log('Restart signal:', res2.status === 1 ? 'SUCCESS' : res2);
}

run().catch(console.error);
