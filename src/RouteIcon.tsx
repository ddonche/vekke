import type { Route } from "./engine/move"
import type { CSSProperties } from "react"
import { RouteDomino } from "./RouteDomino"

const DIR_TO_STRING: Record<1|2|3|4|5|6|7|8, string> = {
  1: "N", 2: "NE", 3: "E", 4: "SE",
  5: "S", 6: "SW", 7: "W", 8: "NW",
}

export function RouteIcon({
  route,
  style,
  onClick,
  selected = false,
  highlightColor = "#5de8f7",
}: {
  route: Route
  style?: CSSProperties
  onClick?: () => void
  selected?: boolean
  highlightColor?: string
}) {
  // Derive pixel size from style.width - supports px numbers or rem strings
  const rawWidth = style?.width
  let size = 50
  if (typeof rawWidth === "number") {
    size = rawWidth
  } else if (typeof rawWidth === "string") {
    if (rawWidth.endsWith("rem")) size = parseFloat(rawWidth) * 16
    else if (rawWidth.endsWith("px")) size = parseFloat(rawWidth)
  }

  return (
    <div
      onClick={onClick}
      style={{
        width: style?.width,
        flexShrink: 0,
        cursor: style?.cursor ?? "default",
        opacity: style?.opacity ?? 1,
        display: "inline-block",
      }}
    >
      <RouteDomino
        dir={DIR_TO_STRING[route.dir as 1|2|3|4|5|6|7|8] ?? "N"}
        dist={route.dist}
        selected={selected}
        size={size}
        highlightColor={highlightColor}
      />
    </div>
  )
}
