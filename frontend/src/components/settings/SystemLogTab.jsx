import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { formatDate } from '../../utils/helpers'
import { alertSuccess, alertError, confirm } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'

const SystemLogTab = () => {
  const [systemLog, setSystemLog] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lines, setLines] = useState(0)

  useEffect(() => {
    loadSystemLog()
  }, [])

  const loadSystemLog = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/settings/system_log')
      if (response.data.success) {
        setSystemLog(response.data.log || '')
        setLines((response.data.log || '').split('\n').length)
      } else {
        setError(response.data.message || 'Failed to load system log')
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load system log')
      setSystemLog('')
    } finally {
      setLoading(false)
    }
  }

  const clearSystemLog = async () => {
    const confirmed = await confirm(
      'Are you sure you want to clear the system log? This action cannot be undone.',
      'Clear System Log'
    )
    if (!confirmed) return

    setLoading(true)
    setError(null)
    try {
      const response = await api.delete('/settings/system_log')
      if (response.data.success) {
        alertSuccess('System log cleared successfully', 'Success')
        setSystemLog('')
        setLines(0)
      } else {
        setError(response.data.message || 'Failed to clear system log')
        alertError(setError, 'Error')
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to clear system log')
      alertError(setError, 'Error')
    } finally {
      setLoading(false)
    }
  }

  if (loading && !systemLog) {
    return (
      <div className="text-center py-10">
        <LoadingSpinner message="Loading system log..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/20 text-red-400 p-4 rounded-lg border border-red-500/30">
        Error: {error}
      </div>
    )
  }

  if (!systemLog) {
    return (
      <div className="text-center py-10">
        <i className="fas fa-file-alt text-5xl opacity-50 mb-4" style={{ color: 'var(--text-secondary)' }}></i>
        <h3 className="m-0 mb-2.5" style={{ color: 'var(--text-primary)' }}>No log data</h3>
        <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>Click Refresh to load system log</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>System Log (c2_system.log)</h4>
        <div className="flex gap-2">
          <button
            onClick={loadSystemLog}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
          <button
            onClick={clearSystemLog}
            disabled={loading || !systemLog}
            className="w-9 h-9 flex items-center justify-center bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Clear Log"
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <div className="flex justify-between items-center px-4 py-3 border-b" style={{ backgroundColor: 'var(--bg-quaternary)', borderBottomColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <i className="fas fa-file-alt text-purple-400"></i>
            <span>c2_system.log</span>
            {lines > 0 && <span className="ml-2">({lines} lines)</span>}
          </div>
        </div>
        <div className="p-4 max-h-[600px] overflow-auto scrollbar-thin">
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap m-0" style={{ color: 'var(--text-primary)' }}>{systemLog}</pre>
        </div>
      </div>
    </>
  )
}

export default SystemLogTab

