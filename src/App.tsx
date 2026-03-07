// src/App.tsx
import "./App.css"
import { Routes, Route, Navigate, useNavigate } from "react-router-dom"
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
import { LeaderboardPage } from "./pages/LeaderboardPage"
import { BoardEditorPage } from "./pages/BoardEditorPage"
import { TutorialPage } from "./pages/TutorialPage"
import HomePage from "./pages/HomePage"
import { AnnouncementsPage } from "./pages/AnnouncementsPage"
import { AdminPage } from "./pages/AdminPage"
import { PuzzleEditorPage } from "./pages/PuzzleEditorPage"
import { PuzzlePage } from "./pages/PuzzlePage"
import { PuzzlesListPage } from "./pages/PuzzlesListPage"

function RulesRedirect() {
  window.location.replace("/rules/index.html")
  return null
}

function TutorialWrapper() {
  const navigate = useNavigate()
  return (
    <TutorialPage
      onComplete={() => navigate("/ai/new")}
      onSkip={() => navigate("/")}
    />
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/home" element={<HomePage />} />
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
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/rules" element={<RulesRedirect />} />
      <Route path="/board-editor" element={<BoardEditorPage />} />
      <Route path="/rules/*" element={<RulesRedirect />} />
      <Route path="/tutorial" element={<TutorialWrapper />} />
      <Route path="/announcements" element={<AnnouncementsPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/puzzle-editor" element={<PuzzleEditorPage />} />
      <Route path="/puzzles" element={<PuzzlesListPage />} />
      <Route path="/puzzle/:id" element={<PuzzlePage />} />
      <Route path="/play" element={<GamePage />} />

    </Routes>
  )
}

export default App
