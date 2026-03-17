import type { Direction } from "./directions"
import type { Route } from "./move"

export const ALL_ROUTES: Route[] = (() => {
  const out: Route[] = []

  // Existing routes: all directions, distance 1–3
  for (let dir = 1 as Direction; dir <= 8; dir++) {
    for (let dist = 1; dist <= 3; dist++) {
      out.push({
        dir,
        dist,
        id: `${dir}/${dist}`,
      })
    }
  }

  // NEW: orthogonal-only distance 4
  for (let dir = 1 as Direction; dir <= 8; dir += 2) {
    out.push({
      dir,
      dist: 4,
      id: `${dir}/4`,
    })
  }

  return out
})()
