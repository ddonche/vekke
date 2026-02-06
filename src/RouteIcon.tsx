import type { Route } from "./engine/move"

export function RouteIcon({ route }: { route: Route }) {
  return (
    <img 
      src={`/assets/routes/${route.dir}-${route.dist}.png`}
      alt={route.id}
      style={{ width: 40, height: 60 }}
    />
  )
}