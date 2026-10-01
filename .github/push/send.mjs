// 운동 알림 푸시 발송 (GitHub Actions 크론이 실행)
import webpush from 'web-push';
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const QUOTES = JSON.parse(html.match(/^const QUOTES=(\[.*\]);$/m)[1]);
const PUB = html.match(/^const VAPID_PUB='([^']+)';/m)[1];
webpush.setVapidDetails('https://kevin260705.github.io/bulkup-log/', PUB, process.env.VAPID_PRIVATE);

const hour = +new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
const TITLES = { 10: '☀️ 좋은 아침, 오늘도 운동하자', 15: '💪 오후 3시, 운동 갈 준비됐어?', 16: '🏋️ 오후 4시, 지금 헬스장 가자' };
const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
const payload = JSON.stringify({
  title: TITLES[hour] || '💪 운동하자',
  body: q.t + (q.a ? ` — ${q.a}` : ''),
  tag: 'workout-' + hour,
});

let subs = JSON.parse(process.env.PUSH_SUBS || '[]');
if (!Array.isArray(subs)) subs = [subs];
let fail = 0;
for (const s of subs) {
  try { await webpush.sendNotification(s, payload, { TTL: 3600, urgency: 'high' }); console.log('sent', s.endpoint.slice(0, 40)); }
  catch (e) { fail++; console.log('fail', e.statusCode, e.body); }
}
if (!subs.length) console.log('no subscriptions');
if (fail && fail === subs.length) process.exit(1);
