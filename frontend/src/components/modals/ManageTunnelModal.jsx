import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { createPortal } from 'react-dom'
import { loadTunnels } from '../../store/slices/tunnelsSlice'
import { useSelector } from 'react-redux'
import api from '../../utils/api'

const ManageTunnelModal = ({ isOpen, onClose, tunnel }) => {
  const dispatch = useDispatch()
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  
  const [tunnelInfo, setTunnelInfo] = useState(null)
  const [routesInfo, setRoutesInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [name, setName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isRefreshingToken, setIsRefreshingToken] = useState(false)
  const [showRefreshTokenConfirm, setShowRefreshTokenConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState('manage') // 'manage' or 'setup'
  const [os, setOs] = useState('windows')
  const [architecture, setArchitecture] = useState('64-bit')

  useEffect(() => {
    if (isOpen && tunnel) {
      setFetching(true)
      setError(null)
      // Fetch full tunnel info including token
      Promise.all([
        api.get(`/tunnels/${tunnel.id}`),
        api.get(`/tunnels/${tunnel.id}/routes`).catch(() => null) // Routes might not exist
      ])
        .then(([tunnelResponse, routesResponse]) => {
          const data = tunnelResponse.data
          setTunnelInfo(data)
          setName(data.name || '')
          
          if (routesResponse && routesResponse.data) {
            setRoutesInfo(routesResponse.data)
          }
        })
        .catch(err => {
          setError(err.response?.data?.detail || err.message || 'Failed to load tunnel info')
        })
        .finally(() => {
          setFetching(false)
        })
    }
  }, [isOpen, tunnel])

  const handleUpdate = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await api.put(`/tunnels/${tunnel.id}`, {
        name: name.trim() || null
      })

      setSuccess('Tunnel updated successfully!')
      // Reload tunnels list
      await dispatch(loadTunnels(true))
      // Reload tunnel info
      const response = await api.get(`/tunnels/${tunnel.id}`)
      setTunnelInfo(response.data)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to update tunnel')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      await api.delete(`/tunnels/${tunnel.id}`)
      setSuccess('Tunnel deleted successfully!')
      // Reload tunnels list
      await dispatch(loadTunnels(true))
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to delete tunnel')
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleRefreshToken = async () => {
    setIsRefreshingToken(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await api.post(`/tunnels/${tunnel.id}/refresh-token`)
      const newToken = response.data.token
      
      // Update tunnel info with new token
      setTunnelInfo(prev => ({ ...prev, token: newToken }))
      
      setSuccess('Token refreshed successfully! The old token has been invalidated.')
      setShowRefreshTokenConfirm(false)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to refresh token')
    } finally {
      setIsRefreshingToken(false)
    }
  }

  const copyToClipboard = async (text) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        setSuccess('Copied to clipboard!')
        setTimeout(() => setSuccess(null), 2000)
        return
      }
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback:', err)
    }
    
    // Fallback for older browsers or when clipboard API fails
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      textArea.style.opacity = '0'
      textArea.setAttribute('readonly', '')
      document.body.appendChild(textArea)
      
      // For iOS
      if (navigator.userAgent.match(/ipad|iphone/i)) {
        const range = document.createRange()
        range.selectNodeContents(textArea)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        textArea.setSelectionRange(0, 999999)
      } else {
        textArea.select()
        textArea.setSelectionRange(0, 999999)
      }
      
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      
      if (successful) {
        setSuccess('Copied to clipboard!')
        setTimeout(() => setSuccess(null), 2000)
      } else {
        throw new Error('execCommand failed')
      }
    } catch (err) {
      console.error('Failed to copy:', err)
      // Show text in alert as last resort
      setError(`Failed to copy. Please copy manually: ${text.substring(0, 50)}...`)
      setTimeout(() => setError(null), 5000)
    }
  }

  const copyToken = () => {
    if (tunnelInfo?.token) {
      copyToClipboard(tunnelInfo.token)
    }
  }

  const copyTunnelId = () => {
    if (tunnelInfo?.id) {
      copyToClipboard(tunnelInfo.id)
    }
  }

  const handleClose = () => {
    setName('')
    setError(null)
    setSuccess(null)
    setTunnelInfo(null)
    setRoutesInfo(null)
    setShowDeleteConfirm(false)
    setShowRefreshTokenConfirm(false)
    setActiveTab('manage')
    setOs('windows')
    setArchitecture('64-bit')
    onClose()
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
          maxWidth: '600px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Manage Tunnel
            </h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-opacity-20 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'manage' 
                  ? 'border-b-2' 
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={{
                color: activeTab === 'manage' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottomColor: activeTab === 'manage' ? 'var(--accent-primary)' : 'transparent'
              }}
            >
              <i className="fas fa-cog mr-2"></i>
              Manage
            </button>
            <button
              onClick={() => setActiveTab('setup')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'setup' 
                  ? 'border-b-2' 
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={{
                color: activeTab === 'setup' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottomColor: activeTab === 'setup' ? 'var(--accent-primary)' : 'transparent'
              }}
            >
              <i className="fas fa-download mr-2"></i>
              Setup
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'manage' ? (
            fetching ? (
              <div className="flex items-center justify-center py-8">
                <i className="fas fa-spinner fa-spin text-2xl" style={{ color: 'var(--accent-primary)' }}></i>
              </div>
            ) : tunnelInfo ? (
              <>
              {error && (
                <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm border border-red-500/30">
                  <i className="fas fa-exclamation-circle mr-2"></i>
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-500/20 text-green-400 p-3 rounded-lg text-sm border border-green-500/30">
                  <i className="fas fa-check-circle mr-2"></i>
                  {success}
                </div>
              )}

              {/* Tunnel ID */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Tunnel ID
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tunnelInfo.id || ''}
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

              {/* Token */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Token
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tunnelInfo.token || 'Token not available'}
                    readOnly
                    className="flex-1 px-3 py-2 rounded-lg border font-mono text-sm"
                    style={{
                      backgroundColor: 'var(--bg-quaternary)',
                      borderColor: 'var(--border-color)',
                      color: tunnelInfo.token ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    placeholder="Token not available"
                  />
                  {tunnelInfo.token && (
                    <>
                      <button
                        onClick={copyToken}
                        className="px-3 py-2 rounded-lg text-sm"
                        style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                        title="Copy Token"
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                      <button
                        onClick={() => setShowRefreshTokenConfirm(true)}
                        className="px-3 py-2 rounded-lg text-sm"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                        title="Refresh Token"
                      >
                        <i className="fas fa-sync-alt"></i>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Refresh Token Confirmation */}
              {showRefreshTokenConfirm && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Refresh Token
                  </p>
                  
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    You may need to generate a new token for security reasons.
                  </p>
                  
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    This action will invalidate the previous token. Note that this will prevent new connections made with the old token, but it won't close existing connections.
                  </p>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleRefreshToken}
                      disabled={isRefreshingToken}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-yellow-500 hover:bg-yellow-600 disabled:opacity-70"
                    >
                      {isRefreshingToken ? (
                        <>
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-sync-alt mr-2"></i>
                          Refresh Token
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowRefreshTokenConfirm(false)}
                      disabled={isRefreshingToken}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-quaternary)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="Tunnel name"
                />
              </div>

              {/* Delete Confirmation */}
              {showDeleteConfirm && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Are you sure you want to delete this tunnel? This action cannot be undone.
                  </p>
                  
                  <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    <p className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>The following will be deleted:</p>
                    <ul className="list-disc list-inside space-y-1.5 ml-2">
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Ingress Rules</span> (Published Application Routes)
                        {routesInfo?.ingress && routesInfo.ingress.length > 0 && (
                          <span className="ml-1">({routesInfo.ingress.filter(r => r.hostname && r.service !== 'http_status:404').length} route(s))</span>
                        )}
                      </li>
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>DNS Records</span>
                        {routesInfo?.ingress && routesInfo.ingress.filter(r => r.hostname && r.service !== 'http_status:404').length > 0 && (
                          <span className="ml-1">({routesInfo.ingress.filter(r => r.hostname && r.service !== 'http_status:404').length} record(s))</span>
                        )}
                      </li>
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Tunnel Configuration</span>
                      </li>
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Tunnel from Cloudflare</span>
                      </li>
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Tunnel from Database</span>
                      </li>
                    </ul>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-70"
                    >
                      {isDeleting ? (
                        <>
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-trash mr-2"></i>
                          Delete
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-quaternary)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Updating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save mr-2"></i>
                      Update
                    </>
                  )}
                </button>
                {!showDeleteConfirm && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600"
                  >
                    <i className="fas fa-trash mr-2"></i>
                    Delete
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              Failed to load tunnel information
            </div>
          )
          ) : (
            /* Setup Tab */
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Choose your environment
                </h3>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                    Choose an operating system:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'windows', name: 'Windows', icon: 'fab fa-windows' },
                      { id: 'mac', name: 'Mac', icon: 'fab fa-apple' },
                      { id: 'debian', name: 'Debian', icon: 'fab fa-linux' },
                      { id: 'redhat', name: 'Red Hat', icon: 'fab fa-redhat' },
                      { id: 'docker', name: 'Docker', icon: 'fab fa-docker' }
                    ].map((osOption) => (
                      <button
                        key={osOption.id}
                        onClick={() => setOs(osOption.id)}
                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                          os === osOption.id
                            ? 'border-2'
                            : 'border'
                        }`}
                        style={{
                          backgroundColor: os === osOption.id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                          borderColor: os === osOption.id ? 'var(--accent-primary)' : 'var(--border-color)',
                          color: os === osOption.id ? 'white' : 'var(--text-primary)'
                        }}
                      >
                        <i className={osOption.icon}></i>
                        <span>{osOption.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {(os === 'windows' || os === 'debian' || os === 'redhat') && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                      Choose an architecture:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {(os === 'windows' ? ['64-bit', '32-bit'] : ['64-bit', '32-bit', 'arm64-bit', 'arm32-bit']).map((arch) => (
                        <button
                          key={arch}
                          onClick={() => setArchitecture(arch)}
                          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                            architecture === arch
                              ? 'border-2'
                              : 'border'
                          }`}
                          style={{
                            backgroundColor: architecture === arch ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                            borderColor: architecture === arch ? 'var(--accent-primary)' : 'var(--border-color)',
                            color: architecture === arch ? 'white' : 'var(--text-primary)'
                          }}
                        >
                          {arch}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Install and run a connector
                </h3>
                
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  To connect your tunnel to Cloudflare, copy-paste one of the following commands into a terminal window. 
                  Remotely managed tunnels require that you install cloudflared 2022.03.04 or later.
                </p>

                {os === 'windows' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                        1. Download{' '}
                        <a
                          href={`https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${architecture === '64-bit' ? 'amd64' : '386'}.msi`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          cloudflared-windows-{architecture === '64-bit' ? 'amd64' : '386'}.msi
                        </a>
                      </p>
                      <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                        2. Run the installer.
                      </p>
                      <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                        3. Open Command Prompt as Administrator.
                      </p>
                      <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                        4. Run the following command:
                      </p>
                      
                      {tunnelInfo?.token ? (
                        <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400">Command Prompt</span>
                            <button
                              onClick={() => {
                                const command = `cloudflared.exe service install ${tunnelInfo.token}`
                                copyToClipboard(command)
                              }}
                              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                            >
                              <i className="fas fa-copy mr-1"></i>
                              Copy
                            </button>
                          </div>
                          <code className="text-sm text-green-400 font-mono break-all block">
                            $ cloudflared.exe service install {tunnelInfo.token}
                          </code>
                        </div>
                      ) : (
                        <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                          <p className="text-sm text-yellow-400">
                            <i className="fas fa-exclamation-triangle mr-2"></i>
                            Token not available. Please ensure tunnel is loaded.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {os === 'mac' && (
                  <div className="space-y-4">
                    {tunnelInfo?.token ? (
                      <>
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            If you don't have cloudflared installed on your machine:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `brew install cloudflared && sudo cloudflared service install ${tunnelInfo.token}`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block break-all">
                              $ brew install cloudflared && sudo cloudflared service install {tunnelInfo.token}
                            </code>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            After you have installed cloudflared on your machine, you can install a service to automatically run your tunnel whenever your machine starts:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `sudo cloudflared service install ${tunnelInfo.token}`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block break-all">
                              $ sudo cloudflared service install {tunnelInfo.token}
                            </code>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            OR run the tunnel manually in your current terminal session only:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `cloudflared tunnel run --token ${tunnelInfo.token}`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block break-all">
                              $ cloudflared tunnel run --token {tunnelInfo.token}
                            </code>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                        <p className="text-sm text-yellow-400">
                          <i className="fas fa-exclamation-triangle mr-2"></i>
                          Token not available. Please ensure tunnel is loaded.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {os === 'debian' && (
                  <div className="space-y-4">
                    {tunnelInfo?.token ? (
                      <>
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            If you don't have cloudflared installed on your machine:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `# Add cloudflare gpg key\nsudo mkdir -p --mode=0755 /usr/share/keyrings\ncurl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg | sudo tee /usr/share/keyrings/cloudflare-public-v2.gpg >/dev/null\n\n# Add this repo to your apt repositories\necho 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list\n\n# install cloudflared\nsudo apt-get update && sudo apt-get install cloudflared`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block whitespace-pre-wrap break-all">
                              $ # Add cloudflare gpg key{'\n'}sudo mkdir -p --mode=0755 /usr/share/keyrings{'\n'}curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg | sudo tee /usr/share/keyrings/cloudflare-public-v2.gpg &gt;/dev/null{'\n'}{'\n'}# Add this repo to your apt repositories{'\n'}echo 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list{'\n'}{'\n'}# install cloudflared{'\n'}sudo apt-get update && sudo apt-get install cloudflared
                            </code>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            After you have installed cloudflared on your machine, you can install a service to automatically run your tunnel whenever your machine starts:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `sudo cloudflared service install ${tunnelInfo.token}`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block break-all">
                              $ sudo cloudflared service install {tunnelInfo.token}
                            </code>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            OR run the tunnel manually in your current terminal session only:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `cloudflared tunnel run --token ${tunnelInfo.token}`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block break-all">
                              $ cloudflared tunnel run --token {tunnelInfo.token}
                            </code>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                        <p className="text-sm text-yellow-400">
                          <i className="fas fa-exclamation-triangle mr-2"></i>
                          Token not available. Please ensure tunnel is loaded.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {os === 'redhat' && (
                  <div className="space-y-4">
                    {tunnelInfo?.token ? (
                      <>
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            If you don't have cloudflared installed on your machine:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `# Add cloudflared.repo to /etc/yum.repos.d/\ncurl -fsSl https://pkg.cloudflare.com/cloudflared.repo | sudo tee /etc/yum.repos.d/cloudflared.repo\n\n#update repo\nsudo yum update\n\n# install cloudflared\nsudo yum install cloudflared`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block whitespace-pre-wrap break-all">
                              $ # Add cloudflared.repo to /etc/yum.repos.d/{'\n'}curl -fsSl https://pkg.cloudflare.com/cloudflared.repo | sudo tee /etc/yum.repos.d/cloudflared.repo{'\n'}{'\n'}#update repo{'\n'}sudo yum update{'\n'}{'\n'}# install cloudflared{'\n'}sudo yum install cloudflared
                            </code>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            After you have installed cloudflared on your machine, you can install a service to automatically run your tunnel whenever your machine starts:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `sudo cloudflared service install ${tunnelInfo.token}`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block break-all">
                              $ sudo cloudflared service install {tunnelInfo.token}
                            </code>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm mb-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                            OR run the tunnel manually in your current terminal session only:
                          </p>
                          <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400">Terminal</span>
                              <button
                                onClick={() => {
                                  const command = `cloudflared tunnel run --token ${tunnelInfo.token}`
                                copyToClipboard(command)
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                              >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                              </button>
                            </div>
                            <code className="text-sm text-green-400 font-mono block break-all">
                              $ cloudflared tunnel run --token {tunnelInfo.token}
                            </code>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                        <p className="text-sm text-yellow-400">
                          <i className="fas fa-exclamation-triangle mr-2"></i>
                          Token not available. Please ensure tunnel is loaded.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {os === 'docker' && (
                  <div className="space-y-4">
                    {tunnelInfo?.token ? (
                      <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">Terminal</span>
                          <button
                            onClick={() => {
                              const command = `docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token ${tunnelInfo.token}`
                                copyToClipboard(command)
                            }}
                            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                          >
                            <i className="fas fa-copy mr-1"></i>
                            Copy
                          </button>
                        </div>
                        <code className="text-sm text-green-400 font-mono block break-all">
                          $ docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token {tunnelInfo.token}
                        </code>
                      </div>
                    ) : (
                      <div className="bg-gray-900 rounded-lg p-4 border" style={{ borderColor: 'var(--border-color)' }}>
                        <p className="text-sm text-yellow-400">
                          <i className="fas fa-exclamation-triangle mr-2"></i>
                          Token not available. Please ensure tunnel is loaded.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ManageTunnelModal

