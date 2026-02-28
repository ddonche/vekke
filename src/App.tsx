// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom"
import { DevInvitePage } from "./pages/DevInvitePage"
import { InviteAcceptPage } from "./pages/InviteAcceptPage"
import { InvitePage } from "./pages/InvitePage"
import { ChallengesPage } from "./pages/ChallengesPage"
import { PvPGameWrapper } from "./pages/PvPGameWrapper"
import { SkinsPage } from "./pages/SkinsPage"
import { AiGameWrapper } from "./pages/AiGameWrapper"
import OrdersPage from "./pages/OrdersPage"
import { AuthGatePage } from "./pages/AuthGatePage"
import { GamePage } from "./components/GamePage"
import ProfilePage from "./pages/ProfilePage"

function App() {
  return (
    <Routes>
      <Route path="/" element={<GamePage />} />

      <Route path="/u/:username" element={<ProfilePage />} />

      <Route path="/auth" element={<AuthGatePage />} />
      <Route path="/auth-host" element={<GamePage />} />

      <Route path="/ai/new" element={<Navigate to="/?openNewGame=1" replace />} />
      <Route path="/ai/:gameId" element={<AiGameWrapper />} />

      <Route path="/pvp/:gameId" element={<PvPGameWrapper />} />

      {/* Invite system */}
      <Route path="/dev/invite" element={<DevInvitePage />} />

      {/* OLD token-based dev invites move here */}
      <Route path="/invite-token/:token" element={<InviteAcceptPage />} />

      {/* NEW permanent invite link */}
      <Route path="/invite/:inviterId" element={<InvitePage />} />

      {/* Inviter inbox */}
      <Route path="/challenges" element={<ChallengesPage />} />
      <Route path="/my-games" element={<ChallengesPage />} />

      <Route path="/skins" element={<SkinsPage />} />
      <Route path="/orders" element={<OrdersPage />} />
    </Routes>
  )
}

export default App