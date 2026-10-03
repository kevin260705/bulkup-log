// 운동 알림 푸시 발송 (GitHub Actions에서 실행)
import webpush from 'web-push';
import fs from 'fs';
import { execSync } from 'child_process';

const html = fs.readFileSync('index.html', 'utf8');
const LINES = JSON.parse(fs.readFileSync(new URL('./lines.json', import.meta.url), 'utf8'));
const PUB = html.match(/^const VAPID_PUB='([^']+)';/m)[1];
webpush.setVapidDetails('https://kevin260705.github.io/bulkup-log/', PUB, process.env.VAPID_PRIVATE);

const HOURS = [8, 10, 12, 14, 16, 18, 20]; // KST
const KST = 9 * 3600e3, MIN = 60e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let subs = JSON.parse(process.env.PUSH_SUBS || '[]');
if (!Array.isArray(subs)) subs = [subs];

async function send(day, idx) {
  // 하루 7번 × 문장 수만큼 순서대로 돌려서 같은 문장이 연달아 안 나오게
  const line = LINES[(day * HOURS.length + idx) % LINES.length];
  const payload = JSON.stringify({ title: '오늘의 한 문장', body: line, tag: 'mind-' + HOURS[idx] });
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s, payload, { TTL: 1800, urgency: 'high' }); ok++; }
    catch (e) { console.log('fail', e.statusCode, e.body); }
  }
  console.log(new Date().toISOString(), `${HOURS[idx]}시`, 'sent', ok, '/', subs.length, line);
}

const now = Date.now();
const day = Math.floor((now + KST) / 86400e3);
// 수동 실행(테스트)은 무작위 문장
if (process.env.EVENT !== 'schedule') { await send(Math.floor(Math.random() * 1e6), Math.floor(Math.random() * HOURS.length)); process.exit(0); }

// 알림 시각 후보: 오늘·내일의 각 시각. 지난 지 30분 이내면 늦게라도 보내고, 2시간 10분 안에 오는 것만 맡는다
const slots = [];
for (const d of [day, day + 1]) HOURS.forEach((h, i) => slots.push({ d, i, t: d * 86400e3 - KST + h * 3600e3 }));
const near = slots.filter((s) => s.t - now > -30 * MIN && s.t - now < 130 * MIN);

// 잠금: 태그 생성은 한 번만 성공한다 → 같은 시각을 두 실행이 보내지 않게
const tagOf = (s) => 'push-' + new Date(s.t + KST).toISOString().slice(0, 13).replace(/[-T]/g, '');
let slot = null;
for (const s of near) {
  try {
    execSync(`gh api -X POST repos/${process.env.REPO}/git/refs -f ref=refs/tags/${tagOf(s)} -f sha=${process.env.GITHUB_SHA}`, { stdio: 'pipe' });
    slot = s; break;
  } catch { console.log('already claimed', tagOf(s)); }
}
if (!slot) { console.log('nothing to do'); process.exit(0); }
console.log('claimed', tagOf(slot));

// 이틀 지난 잠금 태그 정리
try {
  const refs = JSON.parse(execSync(`gh api repos/${process.env.REPO}/git/matching-refs/tags/push-`).toString());
  const cut = new Date(now + KST - 2 * 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
  for (const r of refs) { const k = r.ref.split('push-')[1]; if (k.slice(0, 8) < cut) execSync(`gh api -X DELETE repos/${process.env.REPO}/git/${r.ref}`); }
} catch (e) { console.log('cleanup skipped'); }

const wait = slot.t - Date.now();
if (wait > 0) await sleep(wait);
await send(slot.d, slot.i);
