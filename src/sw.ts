import { precacheAndRoute, NavigationRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute as NavRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// Never intercept Supabase requests
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkOnly()
)

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'Vekke'
  const options = {
    body: data.body ?? "It's your turn.",
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url ?? '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data?.url ?? '/')
  )
})