import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { createPortal } from 'react-dom'
import { loadTunnels } from '../../store/slices/tunnelsSlice'
import { useSelector } from 'react-redux'
import api from '../../utils/api'

const CreateTunnelModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch()
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  
  const [tunnelName, setTunnelName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [createdTunnel, setCreatedTunnel] = useState(null)

  const handleCreate = async () => {
    if (!tunnelName.trim()) {
      setError('Tunnel name is required')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setCreatedTunnel(null)

    try {
      const response = await api.post('/tunnels/', {
        name: tunnelName.trim()
      })

      const data = response.data

      if (data.success) {
        setCreatedTunnel({
          id: data.tunnel_id,
          name: data.name,
          token: data.token
        })
        setSuccess('Tunnel created successfully!')
        setTunnelName('')
        // Reload tunnels list
        await dispatch(loadTunnels(true))
      } else {
        throw new Error(data.message || 'Failed to create tunnel')
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to create tunnel')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setTunnelName('')
    setError(null)
    setSuccess(null)
    setCreatedTunnel(null)
    onClose()
  }

  const copyToken = () => {
    if (createdTunnel?.token) {
      navigator.clipboard.writeText(createdTunnel.token)
      setSuccess('Token copied to clipboard!')
      setTimeout(() => setSuccess(null), 2000)
    }
  }

  const copyTunnelId = () => {
    if (createdTunnel?.id) {
      navigator.clipboard.writeText(createdTunnel.id)
      setSuccess('Tunnel ID copied to clipboard!')
      setTimeout(() => setSuccess(null), 2000)
    }
  }

  if (!isOpen) return null

  const modalContent = (
    <div 
      className="fixed z-[1001] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
    >
      <div 
        className="rounded-xl w-full shadow-2xl border overflow-hidden my-4"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: 'var(--border-color)',
          maxWidth: '500px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Create Tunnel
            </h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-opacity-20 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {createdTunnel ? (
            <div className="space-y-4">
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg text-sm border border-green-500/30">
                <i className="fas fa-check-circle mr-2"></i>
                {success || 'Tunnel created successfully!'}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Tunnel ID
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={createdTunnel.id}
                      readOnly
                      className="flex-1 px-3 py-2 rounded-lg border font-mono text-sm"
                      style={{
                        backgroundColor: 'var(--bg-quaternary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <button
                      onClick={copyTunnelId}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                      title="Copy Tunnel ID"
                    >
                      <i className="fas fa-copy"></i>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Token
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={createdTunnel.token}
                      readOnly
                      className="flex-1 px-3 py-2 rounded-lg border font-mono text-sm"
                      style={{
                        backgroundColor: 'var(--bg-quaternary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <button
                      onClick={copyToken}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                      title="Copy Token"
                    >
                      <i className="fas fa-copy"></i>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Tunnel Name *
                </label>
                <input
                  type="text"
                  value={tunnelName}
                  onChange={(e) => setTunnelName(e.target.value)}
                  placeholder="e.g., tunnel-77b28620-a4f7-4b64-9047-763fc04604e3-CLTWO"
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-quaternary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onKeyUp={(e) => {
                    if (e.key === 'Enter') handleCreate()
                  }}
                />
              </div>

              {error && (
                <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm border border-red-500/30">
                  <i className="fas fa-exclamation-circle mr-2"></i>
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={loading || !tunnelName.trim()}
                  className="flex-1 px-4 py-2 rounded-lg text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Creating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-plus mr-2"></i>
                      Create Tunnel
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border text-sm disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--bg-quaternary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default CreateTunnelModal

