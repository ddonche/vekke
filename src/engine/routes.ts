import { Direction } from "./directions"
import { Route } from "./move"

export const ALL_ROUTES: Route[] = (() => {
  const out: Route[] = []
  for (let dir = 1 as Direction; dir <= 8; dir++) {
    for (let dist = 1; dist <= 3; dist++) {
      out.push({
        dir,
        dist,
        id: `${dir}/${dist}`,
      })
    }
  }
  return out
})()
