import type { CSSProperties } from "react"

export interface RouteDominoProps {
  dir?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"
  dist?: number
  selected?: boolean
  size?: number
  highlightColor?: string
  primaryColor?: string
  secondaryColor?: string
  skinStyle?: Record<string, string>
  dominoStyle?: "default" | "modern" | "notation"
  style?: CSSProperties
  onClick?: () => void
}

export function RouteDomino(props: RouteDominoProps): JSX.Element

export default function App(): JSX.Element
