import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import api from '../../utils/api'
import { formatDate } from '../../utils/helpers'
import { alertSuccess, alertError, confirm } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'
import CreateTokenModal from './CreateTokenModal'
import EditTokenModal from './EditTokenModal'
import NewTokenDisplayModal from './NewTokenDisplayModal'

const ApiTab = () => {
  const auth = useSelector(state => state.auth)
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingToken, setEditingToken] = useState(null)
  const [newToken, setNewToken] = useState(null)
  const [expandedTokens, setExpandedTokens] = useState(new Set())

  useEffect(() => {
    loadApiTokens()
  }, [])

  const apiBaseUrl = window.location.origin
  const swaggerUrl = auth.token ? `${apiBaseUrl}/docs?token=${encodeURIComponent(auth.token)}` : `${apiBaseUrl}/docs`
  const redocUrl = auth.token ? `${apiBaseUrl}/redoc?token=${encodeURIComponent(auth.token)}` : `${apiBaseUrl}/redoc`

  const loadApiTokens = async () => {
    setLoading(true)
    try {
      const response = await api.get('/settings/api_tokens')
      if (response.data.success) {
        setTokens(response.data.tokens || [])
      }
    } catch (err) {
      alertError(err.response?.data?.detail || err.message || 'Failed to load API tokens', 'Error')
    } finally {
      setLoading(false)
    }
  }

  const toggleToken = (tokenId) => {
    setExpandedTokens(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId)
      } else {
        newSet.add(tokenId)
      }
      return newSet
    })
  }

  const handleCreateToken = async (tokenData) => {
    try {
      const response = await api.post('/settings/api_tokens', tokenData)
      if (response.data.success) {
        setNewToken(response.data.token)
        setShowCreateModal(false)
        alertSuccess('Token created successfully! Save it now as it won\'t be shown again.', 'Success')
        await loadApiTokens()
      }
    } catch (err) {
      alertError(err.response?.data?.detail || err.message || 'Failed to create token', 'Error')
    }
  }

  const handleEditToken = (token) => {
    setEditingToken(token)
    setShowEditModal(true)
  }

  const handleUpdateToken = async (tokenId, tokenData) => {
    try {
      const response = await api.put(`/settings/api_tokens/${tokenId}`, tokenData)
      if (response.data.success) {
        alertSuccess('Token updated successfully', 'Success')
        setShowEditModal(false)
        setEditingToken(null)
        await loadApiTokens()
      }
    } catch (err) {
      alertError(err.response?.data?.detail || err.message || 'Failed to update token', 'Error')
    }
  }

  const handleDeleteToken = async (tokenId) => {
    const confirmed = await confirm('Are you sure you want to delete this token?', 'Delete Token')
    if (!confirmed) return

    try {
      const response = await api.delete(`/settings/api_tokens/${tokenId}`)
      if (response.data.success) {
        alertSuccess('Token deleted successfully', 'Success')
        await loadApiTokens()
      }
    } catch (err) {
      alertError(err.response?.data?.detail || err.message || 'Failed to delete token', 'Error')
    }
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      alertSuccess('Token copied to clipboard', 'Success')
    } catch (err) {
      alertError('Failed to copy token', 'Error')
    }
  }

  const availablePermissions = [
    'tunnels:read',
    'tunnels:write',
    'tunnels:delete',
    'commands:execute',
    'commands:read',
    'modules:read',
    'modules:write',
    'modules:delete',
    'settings:read',
    'settings:write',
    'history:read',
    'history:delete'
  ]

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>API Documentation</h4>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
        >
          <i className="fas fa-plus"></i>
          Create Token
        </button>
      </div>

      {/* API Documentation Links */}
      <div className="mb-6">
        <h5 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <i className="fas fa-book" style={{ color: 'var(--accent-primary)' }}></i>
          Interactive API Documentation
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href={swaggerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-6 transition-colors group cursor-pointer"
            style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'
            }}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                <i className="fas fa-code text-white"></i>
              </div>
              <div className="flex-1">
                <h6 className="font-semibold mb-1 group-hover:text-purple-400 transition-colors" style={{ color: 'var(--text-primary)' }}>Swagger UI</h6>
                <p className="text-sm m-0" style={{ color: 'var(--text-secondary)' }}>Interactive API documentation with testing capabilities</p>
                <div className="mt-2 text-xs text-purple-400 flex items-center gap-1">
                  <span>Open in new tab</span>
                  <i className="fas fa-external-link-alt"></i>
                </div>
              </div>
            </div>
          </a>
          <a
            href={redocUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-6 transition-colors group cursor-pointer"
            style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'
            }}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-400 rounded-lg flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                <i className="fas fa-file-alt text-white"></i>
              </div>
              <div className="flex-1">
                <h6 className="font-semibold mb-1 group-hover:text-green-400 transition-colors" style={{ color: 'var(--text-primary)' }}>ReDoc</h6>
                <p className="text-sm m-0" style={{ color: 'var(--text-secondary)' }}>Beautiful, responsive API documentation</p>
                <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
                  <span>Open in new tab</span>
                  <i className="fas fa-external-link-alt"></i>
                </div>
              </div>
            </div>
          </a>
        </div>
      </div>

      {/* API Tokens Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h5 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-key text-purple-400"></i>
            API Tokens
          </h5>
          <button
            onClick={loadApiTokens}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-purple-400 rounded transition-colors"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
            }}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>
        
        {loading && tokens.length === 0 ? (
          <div className="text-center py-6">
            <LoadingSpinner message="Loading tokens..." />
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-6 rounded-lg" style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}>
            <i className="fas fa-key text-3xl opacity-50 mb-2" style={{ color: 'var(--text-secondary)' }}></i>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No API tokens created yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}
              >
                <div
                  onClick={() => toggleToken(token.id)}
                  className="flex items-start justify-between p-4 cursor-pointer transition-colors"
                  style={{ backgroundColor: 'var(--bg-quaternary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h6 className="font-semibold m-0" style={{ color: 'var(--text-primary)' }}>{token.name}</h6>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        token.is_active ? 'bg-green-500 text-white' : ''
                      }`} style={!token.is_active ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' } : {}}>
                        {token.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {token.description && (
                      <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{token.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>Created: {formatDate(token.created_at)}</span>
                      {token.expires_at ? (
                        <span>Expires: {formatDate(token.expires_at)}</span>
                      ) : token.never_expires && (
                        <span className="text-yellow-400">Never expires</span>
                      )}
                      {token.last_used_at && (
                        <span>Last used: {formatDate(token.last_used_at)}</span>
                      )}
                    </div>
                    {token.permissions && token.permissions.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs text-purple-400 mb-1">Permissions:</div>
                        <div className="flex flex-wrap gap-1">
                          {token.permissions.map((perm) => (
                            <span
                              key={perm}
                              className="px-2 py-0.5 text-purple-400 rounded text-xs"
                              style={{ backgroundColor: 'var(--bg-secondary)' }}
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditToken(token)
                      }}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-xs"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteToken(token.id)
                      }}
                      className="px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-xs"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                    <i
                      className={`fas transition-transform duration-200 text-purple-400 ml-2 mt-1 ${
                        expandedTokens.has(token.id) ? 'fa-chevron-down' : 'fa-chevron-right'
                      }`}
                    ></i>
                  </div>
                </div>
                {expandedTokens.has(token.id) && (
                  <div className="px-4 pb-4 border-t" style={{ borderTopColor: 'var(--border-color)' }}>
                    <div className="mt-3 space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <div><strong style={{ color: 'var(--text-primary)' }}>Token ID:</strong> {token.id}</div>
                      {token.created_by && (
                        <div><strong style={{ color: 'var(--text-primary)' }}>Created by:</strong> {token.created_by}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateTokenModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateToken}
          availablePermissions={availablePermissions}
        />
      )}

      {showEditModal && editingToken && (
        <EditTokenModal
          token={editingToken}
          onClose={() => {
            setShowEditModal(false)
            setEditingToken(null)
          }}
          onUpdate={handleUpdateToken}
          availablePermissions={availablePermissions}
        />
      )}

      {newToken && (
        <NewTokenDisplayModal
          token={newToken}
          onClose={() => setNewToken(null)}
          onCopy={copyToClipboard}
        />
      )}
    </>
  )
}

export default ApiTab

