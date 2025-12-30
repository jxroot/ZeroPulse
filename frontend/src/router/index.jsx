import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import App from '../App'
import Login from '../pages/Login'
import Landing from '../pages/Landing'
import Setup from '../pages/Setup'
import Agents from '../pages/Agents'
import TunnelRoutes from '../pages/TunnelRoutes'
import CommandHistory from '../pages/CommandHistory'
import Settings from '../pages/Settings'
import AgentScript from '../pages/AgentScript'
import LocalShellWindow from '../pages/LocalShellWindow'
import About from '../pages/About'
import LoadingSpinner from '../components/common/LoadingSpinner'

// Auth guard component wrapper
const ProtectedRouteWrapper = ({ children }) => {
  const auth = useSelector(state => state.auth)
  
  // Wait for auth to be initialized
  if (!auth.initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e2d]">
        <LoadingSpinner message="Checking authentication..." />
      </div>
    )
  }

  // If not authenticated, redirect to login (which will check setup status and redirect to setup if needed)
  if (!auth.isAuthenticated || !auth.token) {
    return <Navigate to="/login" replace />
  }

  return children
}

// Public route component wrapper
const PublicRouteWrapper = ({ children }) => {
  const auth = useSelector(state => state.auth)
  
  // Wait for auth to be initialized
  if (!auth.initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e2d]">
        <LoadingSpinner message="Checking authentication..." />
      </div>
    )
  }

  // If authenticated, redirect to agents
  if (auth.isAuthenticated && auth.token) {
    return <Navigate to="/agents" replace />
  }

  return children
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: 'landing',
        element: (
          <PublicRouteWrapper>
            <Landing />
          </PublicRouteWrapper>
        )
      },
      {
        path: 'login',
        element: (
          <PublicRouteWrapper>
            <Login />
          </PublicRouteWrapper>
        )
      },
      {
        path: 'setup',
        element: <Setup />
      },
      {
        index: true,
        element: <Navigate to="/agents" replace />
      },
      {
        path: 'agents',
        element: (
          <ProtectedRouteWrapper>
            <Agents />
          </ProtectedRouteWrapper>
        )
      },
      {
        path: 'tunnels',
        element: (
          <ProtectedRouteWrapper>
            <TunnelRoutes />
          </ProtectedRouteWrapper>
        )
      },
      {
        path: 'history',
        element: (
          <ProtectedRouteWrapper>
            <CommandHistory />
          </ProtectedRouteWrapper>
        )
      },
      {
        path: 'AgentScript',
        element: (
          <ProtectedRouteWrapper>
            <AgentScript />
          </ProtectedRouteWrapper>
        )
      },
      {
        path: 'settings',
        element: (
          <ProtectedRouteWrapper>
            <Settings />
          </ProtectedRouteWrapper>
        )
      },
      {
        path: 'about',
        element: (
          <ProtectedRouteWrapper>
            <About />
          </ProtectedRouteWrapper>
        )
      },
      {
        path: 'local-shell',
        element: (
          <ProtectedRouteWrapper>
            <LocalShellWindow />
          </ProtectedRouteWrapper>
        )
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
])

// This will be called from main.jsx
// No need to export initializeAuth anymore as it's handled in main.jsx

export default router

