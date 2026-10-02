// 운동 알림 푸시 발송 (GitHub Actions에서 실행)
import webpush from 'web-push';
import fs from 'fs';
import { execSync } from 'child_process';

const html = fs.readFileSync('index.html', 'utf8');
const LINES = JSON.parse(fs.readFileSync(new URL('./lines.json', import.meta.url), 'utf8'));
const PUB = html.match(/^const VAPID_PUB='([^']+)';/m)[1];
webpush.setVapidDetails('https://kevin260705.github.io/bulkup-log/', PUB, process.env.VAPID_PRIVATE);

const H = 3600e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let subs = JSON.parse(process.env.PUSH_SUBS || '[]');
if (!Array.isArray(subs)) subs = [subs];

async function send(slot) {
  // 하루 3번 × 문장 수만큼 순서대로 돌려서 같은 문장이 연달아 안 나오게
  const day = Math.floor((Date.now() + 9 * H) / 86400e3);
  const line = LINES[(day * 3 + slot) % LINES.length];
  const payload = JSON.stringify({ title: '오늘의 한 문장', body: line, tag: 'workout-' + slot });
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s, payload, { TTL: 3600, urgency: 'high' }); ok++; }
    catch (e) { console.log('fail', e.statusCode, e.body); }
  }
  console.log(new Date().toISOString(), 'slot', slot, 'sent', ok, '/', subs.length, line);
}

if (process.env.EVENT !== 'schedule') { await send(0); process.exit(0); }

// 먼저 시작한 다른 실행이 있으면 그쪽이 보낸다
const runs = JSON.parse(execSync(`gh api "repos/${process.env.REPO}/actions/workflows/workout-reminder.yml/runs?event=schedule&per_page=20"`).toString()).workflow_runs;
// 같은 묶음(아침 = 22~03시 UTC, 오후 = 03~08시 UTC)에서 먼저 생긴 실행이 있는지
const group = (ms) => { const d = new Date(ms + 3 * H); const h = d.getUTCHours(); return (h < 6 ? 'm' : h < 11 ? 'a' : 'x') + d.toISOString().slice(0, 10); };
const me = runs.find((r) => String(r.id) === process.env.RUN_ID);
const myStart = me ? Date.parse(me.created_at) : Date.now();
const dup = runs.find((r) => String(r.id) !== process.env.RUN_ID && Date.parse(r.created_at) < myStart
  && group(Date.parse(r.created_at)) === group(myStart) && !['cancelled', 'failure', 'timed_out'].includes(r.conclusion));
if (dup) { console.log('already handled by run', dup.id); process.exit(0); }

// 이번 실행이 맡을 알림 시각 (UTC): 10시=01:00, 15시=06:00, 16시=07:00
const now = new Date();
const at = (h) => { const d = new Date(now); d.setUTCHours(h, 0, 0, 0); if (d - now < -6 * H) d.setTime(d.getTime() + 24 * H); return d; };
const morning = now.getUTCHours() >= 22 || now.getUTCHours() < 3;
const targets = morning ? [[0, at(1)]] : [[1, at(6)], [2, at(7)]];
for (const [slot, t] of targets) {
  const wait = t - Date.now();
  if (wait < -90 * 60e3) { console.log('too late for slot', slot); continue; }
  if (wait > 0) await sleep(wait);
  await send(slot);
}
