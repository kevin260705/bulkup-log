// 휴식 종료 알림용 서비스 워커 (안드로이드 크롬은 페이지에서 직접 알림을 못 띄워서 필요)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 알림을 누르면 앱으로 돌아오기
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});

// 운동 알림 푸시 (10시 · 15시 · 16시)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '💪 운동하자', {
    body: d.body || '', tag: d.tag || 'workout', renotify: true,
    icon: 'blank.png', badge: 'favicon.png?v=3', vibrate: [200, 100, 200],
  }));
});
