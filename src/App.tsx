// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom"
import { DevInvitePage } from "./pages/DevInvitePage"
import { InviteAcceptPage } from "./pages/InviteAcceptPage"
import { PvPGameWrapper } from "./pages/PvPGameWrapper"
import { SkinsPage } from "./pages/SkinsPage"
import { AiGameWrapper } from "./pages/AiGameWrapper"

import { AuthGatePage } from "./pages/AuthGatePage"
import { GamePage } from "./components/GamePage"

function App() {
  return (
    <Routes>
      {/* (keep whatever you want here) */}
      {/* Home */}
      <Route path="/" element={<GamePage />} />

      {/* Auth bounce + host */}
      <Route path="/auth" element={<AuthGatePage />} />
      <Route path="/auth-host" element={<GamePage />} />

      {/* AI */}
      {/* Legacy/shortcut route: open the New Game modal instead of a start page */}
      <Route path="/ai/new" element={<Navigate to="/?openNewGame=1" replace />} />
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