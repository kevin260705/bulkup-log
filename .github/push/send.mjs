// 운동 알림 푸시 발송 (GitHub Actions에서 실행)
import webpush from 'web-push';
import fs from 'fs';
import { execSync } from 'child_process';

const html = fs.readFileSync('index.html', 'utf8');
const LINES = JSON.parse(fs.readFileSync(new URL('./lines.json', import.meta.url), 'utf8'));
const PUB = html.match(/^const VAPID_PUB='([^']+)';/m)[1];
webpush.setVapidDetails('https://kevin260705.github.io/bulkup-log/', PUB, process.env.VAPID_PRIVATE);

const HOURS = [8, 10, 12, 14, 16, 18, 20, 22, 24]; // KST (24 = 자정)
const KST = 9 * 3600e3, MIN = 60e3, H = 3600e3;
const START = Date.now(), BUDGET = 5 * H + 30 * MIN; // 한 실행은 최대 6시간이라 5.5시간에서 넘긴다
const { REPO, RUN_ID, PARENT, MODE } = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gh = (args) => execSync(`gh api ${args}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let subs = JSON.parse(process.env.PUSH_SUBS || '[]');
if (!Array.isArray(subs)) subs = [subs];

async function send(day, idx) {
  // 하루 9번 × 문장 수만큼 순서대로 돌려서 같은 문장이 연달아 안 나오게
  const line = LINES[(day * HOURS.length + idx) % LINES.length];
  const payload = JSON.stringify({ title: '오늘의 한 문장', body: line, tag: 'mind-' + HOURS[idx] });
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s, payload, { TTL: 1800, urgency: 'high' }); ok++; }
    catch (e) { console.log('fail', e.statusCode, e.body); }
  }
  console.log(new Date().toISOString(), `${HOURS[idx]}시 몫`, 'sent', ok, '/', subs.length, line);
}

// 수동 테스트: 무작위 문장 하나 바로
if (MODE === 'test') { await send(Math.floor(Math.random() * 1e6), Math.floor(Math.random() * HOURS.length)); process.exit(0); }

// 이어달리기가 이미 돌고 있으면(더 먼저 생긴 실행) 이 실행은 빠진다
// 이어달리기 실행 = 예약 실행이거나, 1분 넘게 돌고 있는 수동 실행 (테스트는 몇 초 만에 끝남)
function olderAlive() {
  const runs = JSON.parse(gh(`"repos/${REPO}/actions/workflows/workout-reminder.yml/runs?status=in_progress&per_page=30"`)).workflow_runs;
  return runs.find((r) => r.id < +RUN_ID && String(r.id) !== PARENT
    && (r.event === 'schedule' || Date.now() - Date.parse(r.run_started_at || r.created_at) > MIN));
}
const alive = olderAlive();
if (alive) { console.log('chain already running:', alive.id); process.exit(0); }

// 알림 시각 목록 (어제·오늘·내일 — 어제의 24시 = 오늘 자정)
const slotsFrom = (now) => {
  const day = Math.floor((now + KST) / 86400e3), out = [];
  for (const d of [day - 1, day, day + 1]) HOURS.forEach((h, i) => out.push({ d, i, t: d * 86400e3 - KST + h * H }));
  return out;
};
const tagOf = (s) => 'push-' + new Date(s.t + KST).toISOString().slice(0, 13).replace(/[-T]/g, '');
function claim(s) {
  try { gh(`-X POST repos/${REPO}/git/refs -f ref=refs/tags/${tagOf(s)} -f sha=${process.env.GITHUB_SHA}`); return true; }
  catch { return false; }
}

while (true) {
  const now = Date.now();
  const slots = slotsFrom(now);
  // 지난 알림 중 아직 안 보낸 것: 2시간 안이면 늦게라도 보낸다 (자정~8시는 알림 시각이 없어 조용)
  const due = slots.filter((s) => s.t <= now && now - s.t < 2 * H);
  for (const s of due) if (claim(s)) await send(s.d, s.i);
  const next = slots.find((s) => s.t > now);
  const wait = next.t - now;
  if (Date.now() - START + wait > BUDGET) {
    // 남은 시간 안에 다음 알림이 없으면: 버틸 만큼 기다렸다가 다음 실행으로 넘긴다
    await sleep(Math.max(0, BUDGET - (Date.now() - START)));
    if (olderAlive()) { console.log('another chain took over'); break; }
    gh(`-X POST repos/${REPO}/actions/workflows/workout-reminder.yml/dispatches -f ref=main -f inputs[mode]=chain -f inputs[parent]=${RUN_ID}`);
    console.log('handed off to next run');
    break;
  }
  await sleep(wait + 5000);
  if (olderAlive()) { console.log('another chain took over'); break; }
}

// 이틀 지난 잠금 태그 정리
try {
  const refs = JSON.parse(gh(`repos/${REPO}/git/matching-refs/tags/push-`));
  const cut = new Date(Date.now() + KST - 2 * 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
  for (const r of refs) if (r.ref.split('push-')[1].slice(0, 8) < cut) gh(`-X DELETE repos/${REPO}/git/${r.ref}`);
} catch { console.log('cleanup skipped'); }
