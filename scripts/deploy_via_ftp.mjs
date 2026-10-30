import * as ftp from 'basic-ftp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const FTP_HOST = 'taskflow.zerosyntax.in';
const FTP_USER = 'taskflow';
const FTP_PASS = 'jzD;WpIW1c1[19';

async function deploy() {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    console.log('[FTP 1/4] Connecting to FTP server on port 21...');
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });
    console.log('[FTP 1/4] Authenticated successfully!');

    console.log('[FTP 2/4] Uploading deploy_staging directory to /taskflow...');
    await client.uploadFromDir(path.join(root, 'deploy_staging'), '/taskflow');
    console.log('[FTP 2/4] Upload complete!');

    console.log('[FTP 2.5/4] Uploading live production .env with verified MongoDB Atlas URI...');
    const prodEnv = `# ========================================================
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
    const envStream = (await import('stream')).Readable.from(Buffer.from(prodEnv));
    await client.uploadFrom(envStream, '/taskflow/.env');
    console.log('[FTP 2.5/4] Live .env uploaded successfully!');

    console.log('[FTP 3/4] Updating /taskflow/tmp/restart.txt to restart Phusion Passenger...');
    await client.ensureDir('/taskflow/tmp');
    const restartBuffer = Buffer.from(String(Date.now()));
    const stream = (await import('stream')).Readable.from(restartBuffer);
    await client.uploadFrom(stream, '/taskflow/tmp/restart.txt');
    console.log('[FTP 3/4] Passenger restart touched!');

    console.log('[FTP 4/4] Deployment finished successfully via pure FTP!');
  } catch (err) {
    console.error('[FTP Error]', err);
    throw err;
  } finally {
    client.close();
  }
}

deploy().catch((e) => {
  console.error(e);
  process.exit(1);
});
