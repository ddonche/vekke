// src/App.tsx
import { Routes, Route } from "react-router-dom"
import { GamePage } from "./components/GamePage"
import { DevInvitePage } from "./pages/DevInvitePage"
import { InviteAcceptPage } from "./pages/InviteAcceptPage"
import { PvPGameWrapper } from "./pages/PvPGameWrapper"

function App() {
  return (
    <Routes>
      {/* AI games - use GamePage directly with no props (defaults to AI mode) */}
      <Route path="/" element={<GamePage />} />
      
      {/* PvP games - use wrapper that loads game data and passes to GamePage */}
      <Route path="/pvp/:gameId" element={<PvPGameWrapper />} />
      
      {/* Invite system */}
      <Route path="/dev/invite" element={<DevInvitePage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
    </Routes>
  )
}

export default App
