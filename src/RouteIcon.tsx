import type { Route } from "./engine/move"
import type { CSSProperties } from "react"

export function RouteIcon({ 
  route, 
  style, 
  onClick 
}: { 
  route: Route
  style?: CSSProperties
  onClick?: () => void
}) {
  return (
    <img 
      src={`/assets/routes/${route.dir}-${route.dist}.png`}
      alt={route.id}
      style={{ width: "100%", height: "100%", objectFit: "contain", ...style }}
      onClick={onClick}
    />
  )
}
