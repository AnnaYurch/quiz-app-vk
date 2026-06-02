import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import OrganizerDashboard from './pages/OrganizerDashboard.jsx'
import OrganizerHistory from './pages/OrganizerHistory.jsx'
import OrganizerLive from './pages/OrganizerLive.jsx'
import QuizBuilder from './pages/QuizBuilder.jsx'
import ParticipantView from './pages/ParticipantView.jsx'
import ParticipantHistory from './pages/ParticipantHistory.jsx'
import Navbar from './components/Navbar.jsx'

// Простая защита роутов для организатора: проверяем token и роль из localStorage.
function ProtectedOrganizerRoute({ children }) {
  const token = localStorage.getItem('token')
  const rawUser = localStorage.getItem('user')

  if (!token || !rawUser) {
    return <Navigate to="/login" replace />
  }

  try {
    const user = JSON.parse(rawUser)

    if (user.role !== 'ORGANIZER') {
      return <Navigate to="/" replace />
    }

    return children
  } catch (error) {
    return <Navigate to="/login" replace />
  }
}

function ProtectedAuthRoute({ children }) {
  const token = localStorage.getItem('token')
  const rawUser = localStorage.getItem('user')

  if (!token || !rawUser) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/organizer"
          element={
            <ProtectedOrganizerRoute>
              <OrganizerDashboard />
            </ProtectedOrganizerRoute>
          }
        />
        <Route
          path="/organizer/history"
          element={
            <ProtectedOrganizerRoute>
              <OrganizerHistory />
            </ProtectedOrganizerRoute>
          }
        />
        <Route
          path="/organizer/build/:roomCode"
          element={
            <ProtectedOrganizerRoute>
              <QuizBuilder />
            </ProtectedOrganizerRoute>
          }
        />
        <Route path="/organizer/live/:roomCode" element={<OrganizerLive />} />
        <Route path="/play/:roomCode" element={<ParticipantView />} />
        <Route
          path="/participant/history"
          element={
            <ProtectedAuthRoute>
              <ParticipantHistory />
            </ProtectedAuthRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
