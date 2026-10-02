// 운동 알림 푸시 발송 (GitHub Actions 크론이 실행)
import webpush from 'web-push';
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const LINES = JSON.parse(fs.readFileSync(new URL('./lines.json', import.meta.url), 'utf8'));
const PUB = html.match(/^const VAPID_PUB='([^']+)';/m)[1];
webpush.setVapidDetails('https://kevin260705.github.io/bulkup-log/', PUB, process.env.VAPID_PRIVATE);

const hour = +new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
// 하루 3번 × 40문장을 순서대로 돌려서 13일 넘게 같은 문장이 안 겹치게
const kst = new Date(Date.now() + 9 * 3600e3);
const day = Math.floor(kst.getTime() / 86400e3);
const slot = hour < 13 ? 0 : hour < 16 ? 1 : 2;
const line = LINES[(day * 3 + slot) % LINES.length];
const payload = JSON.stringify({ title: '운동', body: line, tag: 'workout-' + slot });

let subs = JSON.parse(process.env.PUSH_SUBS || '[]');
if (!Array.isArray(subs)) subs = [subs];
let fail = 0;
for (const s of subs) {
  try { await webpush.sendNotification(s, payload, { TTL: 3600, urgency: 'high' }); console.log('sent', s.endpoint.slice(0, 40)); }
  catch (e) { fail++; console.log('fail', e.statusCode, e.body); }
}
if (!subs.length) console.log('no subscriptions');
if (fail && fail === subs.length) process.exit(1);
