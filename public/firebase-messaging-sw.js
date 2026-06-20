/* Firebase Cloud Messaging service worker.
 * Dedicated to push notifications. Does NOT cache app shell. */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCU16Yxze-AtmyJUdqA4xxA3RUQI2_7TuY",
  authDomain: "nunoapp.firebaseapp.com",
  projectId: "nunoapp",
  storageBucket: "nunoapp.firebasestorage.app",
  messagingSenderId: "480016323560",
  appId: "1:480016323560:web:01ed75e51d9ced26b70a5d",
});

const messaging = firebase.messaging();

// Background notifications. FCM auto-shows when payload has `notification`,
// but we also handle data-only payloads.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || payload.data?.title || "Nuno App";
  const body = (payload.notification && payload.notification.body) || payload.data?.body || "";
  const url = payload.data?.url || "/dashboard";
  const tag = payload.data?.tag || undefined;

  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    data: { url },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
