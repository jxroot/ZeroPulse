import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { lazy, Suspense } from 'react'
import App from '../App'
import LoadingSpinner from '../components/common/LoadingSpinner'

// Lazy load pages for better code splitting and performance
const Login = lazy(() => import('../pages/Login'))
const Landing = lazy(() => import('../pages/Landing'))
const Setup = lazy(() => import('../pages/Setup'))
const Agents = lazy(() => import('../pages/Agents'))
const TunnelRoutes = lazy(() => import('../pages/TunnelRoutes'))
const CommandHistory = lazy(() => import('../pages/CommandHistory'))
const Settings = lazy(() => import('../pages/Settings'))
const AgentScript = lazy(() => import('../pages/AgentScript'))
const LocalShellWindow = lazy(() => import('../pages/LocalShellWindow'))
const About = lazy(() => import('../pages/About'))

// Loading fallback component
const PageLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#1e1e2d]">
    <LoadingSpinner message="Loading..." />
  </div>
)

// Auth guard component wrapper
const ProtectedRouteWrapper = ({ children }) => {
  const auth = useSelector(state => state.auth)
  
  // Wait for auth to be initialized
  if (!auth.initialized) {
    return <PageLoadingFallback />
  }

  // If not authenticated, redirect to login (which will check setup status and redirect to setup if needed)
  if (!auth.isAuthenticated || !auth.token) {
    return <Navigate to="/login" replace />
  }

  return <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
}

// Public route component wrapper
const PublicRouteWrapper = ({ children }) => {
  const auth = useSelector(state => state.auth)
  
  // Wait for auth to be initialized
  if (!auth.initialized) {
    return <PageLoadingFallback />
  }

  // If authenticated, redirect to agents
  if (auth.isAuthenticated && auth.token) {
    return <Navigate to="/agents" replace />
  }

  return <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
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

