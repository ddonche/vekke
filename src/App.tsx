// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom"
import { DevInvitePage } from "./pages/DevInvitePage"
import { InviteAcceptPage } from "./pages/InviteAcceptPage"
import { PvPGameWrapper } from "./pages/PvPGameWrapper"
import { SkinsPage } from "./pages/SkinsPage"

import { AiStartPage } from "./pages/AiStartPage"
import { AiGameWrapper } from "./pages/AiGameWrapper"

import { AuthGatePage } from "./pages/AuthGatePage"

// ✅ ADD THIS:
import { GamePage } from "./components/GamePage"

function App() {
  return (
    <Routes>
      {/* (keep whatever you want here) */}
      <Route path="/" element={<AiStartPage />} />

      {/* ✅ Auth bounce + host */}
      <Route path="/auth" element={<AuthGatePage />} />
      <Route path="/auth-host" element={<GamePage />} />

      {/* AI */}
      <Route path="/ai/new" element={<AiStartPage />} />
      <Route path="/ai/:gameId" element={<AiGameWrapper />} />

      {/* PvP */}
      <Route path="/pvp/:gameId" element={<PvPGameWrapper />} />

      {/* Invite system */}
      <Route path="/dev/invite" element={<DevInvitePage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />

      <Route path="/skins" element={<SkinsPage />} />
    </Routes>
  )
}

export default App