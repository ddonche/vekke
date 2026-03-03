import { VekkeLogoLoader } from "../components/VekkeLogoLoader"

export default function LogoLab() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#0a0a0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <VekkeLogoLoader size={90} gap={60} overlap={16} durationMs={2400} />
    </div>
  )
}