import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import api from '../../utils/api'
import { formatDate } from '../../utils/helpers'
import { alertSuccess, alertError, confirm } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'

const ActiveSessionsTab = () => {
  const auth = useSelector(state => state.auth)
  const [sessions, setSessions] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadActiveSessions()
  }, [])

  const loadActiveSessions = async () => {
    setLoading(true)
    try {
      const response = await api.get('/auth/sessions')
      if (response.data.success) {
        setSessions(response.data.sessions || [])
        setIsAdmin(response.data.is_admin || false)
      }
    } catch (err) {
      alertError(err.response?.data?.detail || err.message || 'Failed to load active sessions', 'Error')
    } finally {
      setLoading(false)
    }
  }

  const terminateSession = async (sessionToken) => {
    const confirmed = await confirm('Are you sure you want to terminate this session?', 'Terminate Session')
    if (!confirmed) return

    try {
      const response = await api.delete(`/auth/sessions/${sessionToken}`)
      if (response.data.success) {
        alertSuccess('Session terminated successfully', 'Success')
        await loadActiveSessions()
      }
    } catch (err) {
      alertError(err.response?.data?.detail || err.message || 'Failed to terminate session', 'Error')
    }
  }

  const terminateAllSessions = async () => {
    const confirmed = await confirm('Are you sure you want to terminate all active sessions?', 'Terminate All Sessions')
    if (!confirmed) return

    try {
      const response = await api.delete('/auth/sessions')
      if (response.data.success) {
        alertSuccess(`Terminated ${response.data.terminated_count || 0} session(s)`, 'Success')
        await loadActiveSessions()
      }
    } catch (err) {
      alertError(err.response?.data?.detail || err.message || 'Failed to terminate sessions', 'Error')
    }
  }

  if (loading && sessions.length === 0) {
    return (
      <div className="text-center py-10">
        <LoadingSpinner message="Loading sessions..." />
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Active Sessions</h4>
        <div className="flex gap-2">
          <button
            onClick={terminateAllSessions}
            className="w-9 h-9 flex items-center justify-center bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/25 transition-colors"
            title="Terminate All"
          >
            <i className="fas fa-stop-circle"></i>
          </button>
          <button
            onClick={loadActiveSessions}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-10 rounded-lg" style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}>
          <i className="fas fa-users text-5xl opacity-50 mb-4" style={{ color: 'var(--text-secondary)' }}></i>
          <h3 className="m-0 mb-2.5" style={{ color: 'var(--text-primary)' }}>No active sessions</h3>
          <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>No active user sessions found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {isAdmin && (
            <>
              {/* My Sessions Section */}
              {sessions.filter(s => s.is_current_user).length > 0 && (
                <div>
                  <h5 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <i className="fas fa-user text-blue-400"></i>
                    My Sessions ({sessions.filter(s => s.is_current_user).length})
                  </h5>
                  <div className="space-y-3">
                    {sessions.filter(s => s.is_current_user).map((session) => (
                      <SessionCard key={session.token} session={session} onTerminate={terminateSession} isCurrentUser={true} />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Other Users' Sessions Section */}
              {sessions.filter(s => !s.is_current_user).length > 0 && (
                <div>
                  <h5 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <i className="fas fa-users text-purple-400"></i>
                    Other Users' Sessions ({sessions.filter(s => !s.is_current_user).length})
                  </h5>
                  <div className="space-y-3">
                    {sessions.filter(s => !s.is_current_user).map((session) => (
                      <SessionCard key={session.token} session={session} onTerminate={terminateSession} isCurrentUser={false} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          
          {!isAdmin && (
            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionCard key={session.token} session={session} onTerminate={terminateSession} isCurrentUser={true} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

const SessionCard = ({ session, onTerminate, isCurrentUser }) => {
  return (
    <div
      className="rounded-lg p-5 hover:shadow-lg transition-shadow"
      style={{ 
        backgroundColor: 'var(--bg-quaternary)', 
        border: `1px solid ${isCurrentUser ? 'var(--border-color)' : 'rgba(139, 92, 246, 0.3)'}`,
        borderLeft: isCurrentUser ? undefined : '4px solid rgba(139, 92, 246, 0.5)'
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <h6 className="font-semibold m-0 text-base" style={{ color: 'var(--text-primary)' }}>{session.username}</h6>
            <span className="px-2 py-1 bg-green-500 text-white rounded text-xs font-semibold">Active</span>
            {isCurrentUser && (
              <span className="px-2 py-1 bg-blue-500 text-white rounded text-xs font-semibold">Current</span>
            )}
          </div>
                  <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <i className="fas fa-key text-purple-400 w-4"></i>
                      <code className="text-purple-400 font-mono">{session.token}</code>
                    </div>
                    {session.ip_address && (
                      <div className="flex items-center gap-2">
                        <i className="fas fa-network-wired w-4"></i>
                        <span>IP Address: {session.ip_address}</span>
                      </div>
                    )}
                    {session.user_agent && (
                      <div className="flex items-center gap-2">
                        <i className="fas fa-desktop w-4"></i>
                        <span className="truncate">{session.user_agent}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <i className="far fa-clock w-4"></i>
                      <span>Created: {formatDate(session.created_at)}</span>
                    </div>
                    {session.duration_formatted && (
                      <div className="flex items-center gap-2">
                        <i className="fas fa-hourglass-half w-4"></i>
                        <span>Duration: {session.duration_formatted}</span>
                      </div>
                    )}
                    {session.last_activity && (
                      <div className="flex items-center gap-2">
                        <i className="fas fa-clock w-4"></i>
                        <span>Last Activity: {formatDate(session.last_activity)} {session.idle_formatted && `(${session.idle_formatted} ago)`}</span>
                      </div>
                    )}
                    {session.expires_at && (
                      <div className="flex items-center gap-2">
                        <i className="fas fa-calendar-times w-4"></i>
                        <span>Expires: {formatDate(session.expires_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onTerminate(session.token)}
                  className="ml-4 w-9 h-9 flex items-center justify-center bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/25 transition-colors"
                  title="Terminate"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
    </div>
  )
}

export default ActiveSessionsTab

