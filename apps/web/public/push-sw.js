// Imported by the generated service worker (workbox.importScripts). Plain JS: no build step.
const TEXTS = {
  he: {
    test: 'תזכורת לבדיקה',
    due: 'להיום: ',
    time: 'תזכורת: ',
    snooze: 'חזר: ',
    generic: 'הפתקים שלי',
  },
  en: {
    test: 'Test reminder',
    due: 'Due today: ',
    time: 'Reminder: ',
    snooze: 'Back: ',
    generic: 'Notes',
  },
};

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === 'object' && typeof data.kind === 'string') {
      return {
        kind: data.kind,
        title: typeof data.title === 'string' ? data.title.slice(0, 120) : '',
        noteId: typeof data.noteId === 'string' ? data.noteId : '',
      };
    }
  } catch {
    // unknown shape: fall through to the generic notification
  }
  return null;
}

globalThis.addEventListener('push', (event) => {
  const texts = (globalThis.navigator.language || '').startsWith('he') ? TEXTS.he : TEXTS.en;
  const payload = readPayload(event);
  const prefix = payload ? (texts[payload.kind] ?? '') : '';
  const body = !payload
    ? texts.generic
    : payload.kind === 'test'
      ? texts.test
      : prefix + payload.title;
  event.waitUntil(
    globalThis.registration.showNotification(texts.generic, {
      body,
      icon: '/icon-192.png',
      data: { noteId: payload ? payload.noteId : '' },
    }),
  );
});

globalThis.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const noteId = event.notification.data && event.notification.data.noteId;
  const path = noteId ? `/notes/${encodeURIComponent(noteId)}` : '/';
  event.waitUntil(
    globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients[0];
      if (open && 'focus' in open) return open.focus();
      return globalThis.clients.openWindow(path);
    }),
  );
});
