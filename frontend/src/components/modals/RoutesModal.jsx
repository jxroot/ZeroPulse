import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { createPortal } from 'react-dom'
import { closeModal, loadRoutes, saveRoutes, setDefaultHostname, setSSHHostname, addRoute, removeRoute, setActiveTab } from '../../store/slices/routesSlice'
import { loadRouteProxies, killAllRouteProxies } from '../../store/slices/routeProxiesSlice'
import LoadingSpinner from '../common/LoadingSpinner'
import RouteProxyList from '../routeProxies/RouteProxyList'
import { alertSuccess, alertError, confirm, formatErrorMessage } from '../../utils/alert'

const RoutesModal = () => {
  const dispatch = useDispatch()
  const routes = useSelector(state => state.routes)
  const routeProxies = useSelector(state => state.routeProxies)
  const theme = useSelector(state => state.theme.theme)
  
  const [localRoutes, setLocalRoutes] = useState([])
  const [localDefaultHostname, setLocalDefaultHostname] = useState('')
  const [localWinrmUsername, setLocalWinrmUsername] = useState('')
  const [localWinrmPassword, setLocalWinrmPassword] = useState('')
  const [localWinrmNtlmHash, setLocalWinrmNtlmHash] = useState('')
  const [localSSHHostname, setLocalSSHHostname] = useState('')
  const [localSSHUsername, setLocalSSHUsername] = useState('')
  const [localSSHPassword, setLocalSSHPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (routes.isModalOpen && routes.currentTunnelId) {
      dispatch(loadRoutes(routes.currentTunnelId))
      if (routes.activeTab === 'proxies') {
        dispatch(loadRouteProxies(routes.currentTunnelId))
      }
    }
  }, [dispatch, routes.isModalOpen, routes.currentTunnelId])

  useEffect(() => {
    if (routes.activeTab === 'proxies' && routes.currentTunnelId) {
      dispatch(loadRouteProxies(routes.currentTunnelId))
    }
  }, [dispatch, routes.activeTab, routes.currentTunnelId])

  useEffect(() => {
    if (routes.currentTunnelId && routes.routes) {
      let routesToSet = [...routes.routes]
      
      // Infer type from service if type is missing (fallback for backward compatibility)
      routesToSet = routesToSet.map(route => {
        if (route.service === 'http_status:404') {
          return route
        }
        if (!route.type || !route.type.trim()) {
          const service = route.service || ''
          if (service.startsWith('http://')) {
            route.type = 'HTTP'
          } else if (service.startsWith('https://')) {
            route.type = 'HTTPS'
          } else if (service.startsWith('tcp://')) {
            route.type = 'TCP'
          } else if (service.startsWith('ssh://')) {
            route.type = 'SSH'
          } else {
            route.type = 'HTTP' // Default
          }
        }
        return route
      })
      
      const hasCatchAll = routesToSet.some(r => r.service === 'http_status:404')
      if (!hasCatchAll) {
        routesToSet.push({ service: 'http_status:404' })
      }
      const catchAllIndex = routesToSet.findIndex(r => r.service === 'http_status:404')
      if (catchAllIndex !== -1 && catchAllIndex !== routesToSet.length - 1) {
        const catchAll = routesToSet.splice(catchAllIndex, 1)[0]
        routesToSet.push(catchAll)
      }
      setLocalRoutes(routesToSet)
      setLocalDefaultHostname(routes.defaultHostname || '')
      setLocalWinrmUsername(routes.winrmUsername || '')
      setLocalWinrmPassword(routes.winrmPassword || '')
      setLocalWinrmNtlmHash(routes.winrmNtlmHash || '')
      setLocalSSHHostname(routes.sshHostname || '')
      setLocalSSHUsername(routes.sshUsername || '')
      setLocalSSHPassword(routes.sshPassword || '')
      setDomain(routes.domain || '')
    } else if (!routes.currentTunnelId) {
      setLocalRoutes([])
      setLocalDefaultHostname('')
      setLocalWinrmUsername('')
      setLocalWinrmPassword('')
      setLocalWinrmNtlmHash('')
      setLocalSSHHostname('')
      setLocalSSHUsername('')
      setLocalSSHPassword('')
      setDomain('')
    }
  }, [routes.currentTunnelId, routes.routes, routes.defaultHostname, routes.winrmUsername, routes.winrmPassword, routes.winrmNtlmHash, routes.sshHostname, routes.sshUsername, routes.sshPassword, routes.domain])

  const handleAddRoute = () => {
    const catchAllIndex = localRoutes.findIndex(r => r.service === 'http_status:404')
    // Infer type from default service
    const defaultService = 'tcp://localhost:5986'
    const newRoute = {
      hostname: '',
      type: 'TCP', // Set default type based on default service
      service: defaultService
    }
    if (catchAllIndex !== -1) {
      setLocalRoutes([...localRoutes.slice(0, catchAllIndex), newRoute, ...localRoutes.slice(catchAllIndex)])
    } else {
      setLocalRoutes([...localRoutes, newRoute])
    }
  }

  const handleRemoveRoute = (index) => {
    if (localRoutes[index].service === 'http_status:404' && localRoutes.length === 1) {
      return
    }
    const newRoutes = localRoutes.filter((_, i) => i !== index)
    const hasCatchAll = newRoutes.some(r => r.service === 'http_status:404')
    if (!hasCatchAll && newRoutes.length > 0) {
      newRoutes.push({ service: 'http_status:404' })
    }
    setLocalRoutes(newRoutes)
  }

  const handleUpdateRoute = (index, field, value) => {
    const newRoutes = [...localRoutes]
    newRoutes[index] = { ...newRoutes[index], [field]: value }
    setLocalRoutes(newRoutes)
  }

  const handleUpdateServiceByType = (index, type) => {
    if (!type || !type.trim()) {
      return // Don't update if type is empty
    }
    
    const typeServiceMap = {
      'HTTP': 'http://localhost:80',
      'HTTPS': 'https://localhost:443',
      'TCP': 'tcp://localhost:5986',
      'SSH': 'ssh://localhost:22'
    }
    
    const currentRoute = localRoutes[index]
    if (!currentRoute) return
    
    const currentService = currentRoute.service || ''
    const isDefaultService = !currentService.trim() || 
      Object.values(typeServiceMap).includes(currentService) ||
      currentService === 'tcp://localhost:5986'
    
    // Update service if it's a default service
    if (isDefaultService && typeServiceMap[type]) {
      // Update both type and service together
      const newRoutes = [...localRoutes]
      newRoutes[index] = { 
        ...newRoutes[index], 
        type: type,
        service: typeServiceMap[type]
      }
      setLocalRoutes(newRoutes)
    }
  }

  const handleSave = async () => {
    if (!routes.currentTunnelId) {
      alertError('Please select a tunnel first', 'No Tunnel Selected')
      return
    }

    try {
      setResult(null) // Clear previous result
      await dispatch(saveRoutes({
        tunnelId: routes.currentTunnelId,
        routes: localRoutes,
        defaultHostname: localDefaultHostname,
        winrmUsername: localWinrmUsername,
        winrmPassword: localWinrmPassword,
        winrmNtlmHash: localWinrmNtlmHash,
        sshHostname: localSSHHostname,
        sshUsername: localSSHUsername,
        sshPassword: localSSHPassword
      })).unwrap()
      setResult({
        success: true,
        message: 'Routes and default hostname updated successfully!'
      })
      alertSuccess('Routes and default hostname updated successfully!', 'Success')
    } catch (err) {
      const errorData = err?.response?.data || err || 'Failed to save routes'
      const errorMessage = formatErrorMessage(errorData)
      setResult({
        success: false,
        message: errorMessage
      })
      // Don't show alert modal, error is shown in result section below
    }
  }

  const handleKillAllProxies = async () => {
    const confirmed = await confirm(
      '⚠️ Are you sure you want to kill all Route Proxies?\n\nThis will stop all active connections.',
      'Kill All Route Proxies'
    )
    if (!confirmed) return

    try {
      await dispatch(killAllRouteProxies()).unwrap()
      if (routes.currentTunnelId) {
        await dispatch(loadRouteProxies(routes.currentTunnelId))
      }
      alertSuccess('All route proxies killed successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to kill all route proxies', 'Error')
    }
  }

  const handleClose = () => {
    dispatch(closeModal())
  }

  if (!routes.isModalOpen) return null

  const isLightMode = theme === 'light'
  
  const modalContent = (
    <div 
      className="fixed z-[1000] left-0 top-0 w-full h-full backdrop-blur-sm overflow-y-auto"
      style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}>
      <div 
        className="rounded-2xl w-full max-w-[95vw] max-h-[95vh] mx-auto my-4 border shadow-2xl flex flex-col"
        style={{
          background: isLightMode 
            ? 'linear-gradient(to bottom right, #ffffff, #f8f9fa)' 
            : 'linear-gradient(to bottom right, #2a2a3e, #1a1a2e)',
          borderColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
        }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#667eea] via-[#764ba2] to-[#f093fb] p-4 flex justify-between items-center rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-white/30">
              <i className="fas fa-route text-white text-xl"></i>
            </div>
            <div>
              <h3 className="text-white text-xl font-bold m-0">Tunnel Routes Configuration</h3>
              <p className="text-white/90 text-sm m-0">Configure network routes and access settings</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="w-10 h-10 bg-white/15 backdrop-blur-sm border-2 border-white/20 rounded-lg text-white hover:bg-white/25 transition-all flex items-center justify-center">
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1" style={{ color: 'var(--text-primary)' }}>
          {/* Tunnel ID Badge */}
          {routes.currentTunnelId && (
            <div 
              className="border rounded-lg p-4 flex items-center gap-4 mb-6"
              style={{
                background: isLightMode 
                  ? 'linear-gradient(to right, rgba(147, 51, 234, 0.1), rgba(59, 130, 246, 0.1))' 
                  : 'linear-gradient(to right, rgba(147, 51, 234, 0.15), rgba(59, 130, 246, 0.15))',
                borderColor: isLightMode ? 'rgba(147, 51, 234, 0.2)' : 'rgba(147, 51, 234, 0.3)'
              }}>
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-500 rounded-lg flex items-center justify-center text-white text-xl">
                <i className="fas fa-server"></i>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Tunnel ID</label>
                <div className="font-mono text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>{routes.currentTunnelId}</div>
              </div>
            </div>
          )}

          {routes.loading && localRoutes.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner message="Loading routes..." />
            </div>
          ) : routes.currentTunnelId ? (
            <>
              {/* Tabs */}
              <div className="flex border-b-2 mb-6" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  onClick={() => dispatch(setActiveTab('routes'))}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    routes.activeTab === 'routes'
                      ? 'border-purple-400'
                      : 'border-transparent'
                  }`}
                  style={{
                    color: routes.activeTab === 'routes' 
                      ? 'var(--accent-primary)' 
                      : 'var(--text-secondary)',
                    borderColor: routes.activeTab === 'routes' 
                      ? 'var(--accent-primary)' 
                      : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (routes.activeTab !== 'routes') {
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (routes.activeTab !== 'routes') {
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }
                  }}
                >
                  <i className="fas fa-list mr-2"></i>
                  Routes
                </button>
                <button
                  onClick={() => dispatch(setActiveTab('proxies'))}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    routes.activeTab === 'proxies'
                      ? 'border-purple-400'
                      : 'border-transparent'
                  }`}
                  style={{
                    color: routes.activeTab === 'proxies' 
                      ? 'var(--accent-primary)' 
                      : 'var(--text-secondary)',
                    borderColor: routes.activeTab === 'proxies' 
                      ? 'var(--accent-primary)' 
                      : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (routes.activeTab !== 'proxies') {
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (routes.activeTab !== 'proxies') {
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }
                  }}
                >
                  <i className="fas fa-network-wired mr-2"></i>
                  Route Proxies
                </button>
              </div>

              {/* Routes Tab */}
              {routes.activeTab === 'routes' && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Result Message */}
                  {result && (
                    <div
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: result.success 
                          ? (isLightMode ? 'rgba(40, 167, 69, 0.1)' : 'rgba(40, 167, 69, 0.15)')
                          : (isLightMode ? 'rgba(220, 53, 69, 0.1)' : 'rgba(220, 53, 69, 0.15)'),
                        borderColor: result.success 
                          ? (isLightMode ? 'rgba(40, 167, 69, 0.2)' : 'rgba(40, 167, 69, 0.3)')
                          : (isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)')
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <i
                          className={`fas text-lg ${
                            result.success ? 'fa-check-circle' : 'fa-exclamation-circle'
                          }`}
                          style={{ color: result.success ? 'var(--success)' : 'var(--danger)' }}
                        ></i>
                        <div className="flex-1">
                          <strong style={{ color: result.success ? 'var(--success)' : 'var(--danger)' }}>
                            {result.success ? 'Success' : 'Error'}
                          </strong>
                          <p className="text-sm mt-1 whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                            {result.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Default Data for WinRM */}
                  <div className="card p-6">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <i className="fas fa-cog" style={{ color: 'var(--accent-primary)' }}></i>
                      <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Default Data for WinRM</h4>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-globe" style={{ color: 'var(--accent-primary)' }}></i>
                          Hostname
                          {domain && <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>(must end with .{domain})</span>}
                        </label>
                        <input
                          type="text"
                          value={localDefaultHostname}
                          onChange={(e) => setLocalDefaultHostname(e.target.value)}
                          className={`w-full p-3 border rounded-lg font-mono focus:outline-none ${
                            domain && localDefaultHostname && !localDefaultHostname.endsWith(`.${domain}`) && localDefaultHostname !== domain
                              ? 'border-red-500 focus:border-red-500'
                              : ''
                          }`}
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: domain && localDefaultHostname && !localDefaultHostname.endsWith(`.${domain}`) && localDefaultHostname !== domain
                              ? 'var(--danger)'
                              : 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => {
                            if (!(domain && localDefaultHostname && !localDefaultHostname.endsWith(`.${domain}`) && localDefaultHostname !== domain)) {
                              e.currentTarget.style.borderColor = 'var(--accent-primary)'
                            }
                          }}
                          onBlur={(e) => {
                            if (!(domain && localDefaultHostname && !localDefaultHostname.endsWith(`.${domain}`) && localDefaultHostname !== domain)) {
                              e.currentTarget.style.borderColor = 'var(--border-color)'
                            }
                          }}
                          placeholder={domain ? `e.g., tunnel.${domain}` : 'e.g., tunnel.example.com'}
                        />
                        {domain && localDefaultHostname && !localDefaultHostname.endsWith(`.${domain}`) && localDefaultHostname !== domain && (
                          <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                            Hostname must end with .{domain}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-user" style={{ color: 'var(--accent-primary)' }}></i>
                          Username
                        </label>
                        <input
                          type="text"
                          value={localWinrmUsername}
                          onChange={(e) => setLocalWinrmUsername(e.target.value)}
                          className="w-full p-3 border rounded-lg font-mono focus:outline-none"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="e.g., WinRMUser"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-lock" style={{ color: 'var(--accent-primary)' }}></i>
                          Password
                        </label>
                        <input
                          type="password"
                          value={localWinrmPassword}
                          onChange={(e) => setLocalWinrmPassword(e.target.value)}
                          className="w-full p-3 border rounded-lg font-mono focus:outline-none"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="Enter WinRM password"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-hashtag" style={{ color: 'var(--accent-primary)' }}></i>
                          NTLM Hash
                        </label>
                        <input
                          type="text"
                          value={localWinrmNtlmHash}
                          onChange={(e) => setLocalWinrmNtlmHash(e.target.value)}
                          className="w-full p-3 border rounded-lg font-mono focus:outline-none"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="e.g., aad3b435b51404eeaad3b435b51404ee"
                        />
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Optional: NTLM hash for pass-the-hash authentication</p>
                      </div>
                      <div className="p-3 rounded flex items-start gap-2 text-sm border-l-4" style={{ 
                        backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)',
                        borderColor: 'var(--accent-primary)',
                        color: 'var(--text-secondary)'
                      }}>
                        <i className="fas fa-info-circle mt-0.5" style={{ color: 'var(--accent-primary)' }}></i>
                        <span>This hostname and credentials will be used for all WinRM connections. Must be configured before using WinRM features.</span>
                      </div>
                    </div>
                  </div>

                  {/* Default Data for SSH */}
                  <div className="card p-6">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <i className="fas fa-cog" style={{ color: 'var(--accent-primary)' }}></i>
                      <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Default Data for SSH</h4>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-globe" style={{ color: 'var(--accent-primary)' }}></i>
                          Hostname
                          {domain && <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>(must end with .{domain})</span>}
                        </label>
                        <input
                          type="text"
                          value={localSSHHostname}
                          onChange={(e) => setLocalSSHHostname(e.target.value)}
                          className={`w-full p-3 border rounded-lg font-mono focus:outline-none ${
                            domain && localSSHHostname && !localSSHHostname.endsWith(`.${domain}`) && localSSHHostname !== domain
                              ? 'border-red-500 focus:border-red-500'
                              : ''
                          }`}
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: domain && localSSHHostname && !localSSHHostname.endsWith(`.${domain}`) && localSSHHostname !== domain
                              ? 'var(--danger)'
                              : 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => {
                            if (!(domain && localSSHHostname && !localSSHHostname.endsWith(`.${domain}`) && localSSHHostname !== domain)) {
                              e.currentTarget.style.borderColor = 'var(--accent-primary)'
                            }
                          }}
                          onBlur={(e) => {
                            if (!(domain && localSSHHostname && !localSSHHostname.endsWith(`.${domain}`) && localSSHHostname !== domain)) {
                              e.currentTarget.style.borderColor = 'var(--border-color)'
                            }
                          }}
                          placeholder={domain ? `e.g., tunnel.${domain}` : 'e.g., tunnel.example.com'}
                        />
                        {domain && localSSHHostname && !localSSHHostname.endsWith(`.${domain}`) && localSSHHostname !== domain && (
                          <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                            Hostname must end with .{domain}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-user" style={{ color: 'var(--accent-primary)' }}></i>
                          Username
                        </label>
                        <input
                          type="text"
                          value={localSSHUsername}
                          onChange={(e) => setLocalSSHUsername(e.target.value)}
                          className="w-full p-3 border rounded-lg font-mono focus:outline-none"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="e.g., root"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-lock" style={{ color: 'var(--accent-primary)' }}></i>
                          Password
                        </label>
                        <input
                          type="password"
                          value={localSSHPassword}
                          onChange={(e) => setLocalSSHPassword(e.target.value)}
                          className="w-full p-3 border rounded-lg font-mono focus:outline-none"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="Enter SSH password"
                        />
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Optional: Password for SSH authentication (if not using key-based auth)</p>
                      </div>
                      <div className="p-3 rounded flex items-start gap-2 text-sm border-l-4" style={{ 
                        backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)',
                        borderColor: 'var(--accent-primary)',
                        color: 'var(--text-secondary)'
                      }}>
                        <i className="fas fa-info-circle mt-0.5" style={{ color: 'var(--accent-primary)' }}></i>
                        <span>This hostname and credentials will be used for all SSH connections. SSH private key is automatically used from <code className="px-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>/root/.ssh/id_ed25519</code> if password is not provided.</span>
                      </div>
                    </div>
                  </div>

                  {/* Routes List */}
                  <div className="card p-6">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-center gap-2">
                        <i className="fas fa-route" style={{ color: 'var(--accent-primary)' }}></i>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Ingress Rules
                          {localRoutes.length > 0 && (
                            <span className="font-normal ml-2" style={{ color: 'var(--text-tertiary)' }}>({localRoutes.length})</span>
                          )}
                        </h4>
                      </div>
                      <button
                        onClick={handleAddRoute}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-500 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        <i className="fas fa-plus"></i>
                        Add Route
                      </button>
                    </div>

                    <div className="space-y-3">
                      {localRoutes.map((route, index) => (
                        <div key={index} className="border rounded-lg p-4" style={{ 
                          backgroundColor: 'var(--bg-secondary)', 
                          borderColor: 'var(--border-color)' 
                        }}>
                          {route.service === 'http_status:404' ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <i className="fas fa-asterisk" style={{ color: 'var(--warning)' }}></i>
                                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Catch-All (404)</span>
                                <span className="text-xs px-2 py-1 rounded" style={{ 
                                  color: 'var(--text-tertiary)', 
                                  backgroundColor: 'var(--bg-tertiary)' 
                                }}>Default</span>
                              </div>
                              {localRoutes.length > 1 && (
                                <button
                                  onClick={() => handleRemoveRoute(index)}
                                  className="transition-colors"
                                  style={{ color: 'var(--danger)' }}
                                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                  title="Remove route"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                                  Hostname
                                  {domain && <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>(must end with .{domain})</span>}
                                </label>
                                <input
                                  type="text"
                                  value={route.hostname || ''}
                                  onChange={(e) => handleUpdateRoute(index, 'hostname', e.target.value)}
                                  className={`w-full p-2 border rounded text-sm focus:outline-none ${
                                    domain && route.hostname && !route.hostname.endsWith(`.${domain}`) && route.hostname !== domain
                                      ? 'border-red-500 focus:border-red-500'
                                      : ''
                                  }`}
                                  style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: domain && route.hostname && !route.hostname.endsWith(`.${domain}`) && route.hostname !== domain
                                      ? 'var(--danger)'
                                      : 'var(--border-color)',
                                    color: 'var(--text-primary)'
                                  }}
                                  onFocus={(e) => {
                                    if (!(domain && route.hostname && !route.hostname.endsWith(`.${domain}`) && route.hostname !== domain)) {
                                      e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (!(domain && route.hostname && !route.hostname.endsWith(`.${domain}`) && route.hostname !== domain)) {
                                      e.currentTarget.style.borderColor = 'var(--border-color)'
                                    }
                                  }}
                                  placeholder={domain ? `subdomain.${domain}` : 'example.com'}
                                />
                                {domain && route.hostname && !route.hostname.endsWith(`.${domain}`) && route.hostname !== domain && (
                                  <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                                    Hostname must end with .{domain}
                                  </p>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Type</label>
                                <select
                                  value={route.type || ''}
                                  onChange={(e) => {
                                    const newType = e.target.value
                                    if (newType) {
                                      // Update type and service together if needed
                                      handleUpdateServiceByType(index, newType)
                                    } else {
                                      // Just update type if empty
                                      handleUpdateRoute(index, 'type', '')
                                    }
                                  }}
                                  className="w-full p-2 border rounded text-sm focus:outline-none"
                                  style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--border-color)',
                                    color: 'var(--text-primary)'
                                  }}
                                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                >
                                  <option value="">Select...</option>
                                  <option value="HTTP">HTTP</option>
                                  <option value="HTTPS">HTTPS</option>
                                  <option value="TCP">TCP</option>
                                  <option value="SSH">SSH</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Service</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={route.service || ''}
                                    onChange={(e) => handleUpdateRoute(index, 'service', e.target.value)}
                                    className="flex-1 p-2 border rounded text-sm font-mono focus:outline-none"
                                    style={{
                                      backgroundColor: 'var(--bg-tertiary)',
                                      borderColor: 'var(--border-color)',
                                      color: 'var(--text-primary)'
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    placeholder="tcp://localhost:5986"
                                  />
                                  <button
                                    onClick={() => handleRemoveRoute(index)}
                                    className="px-3 transition-colors border rounded"
                                    style={{ 
                                      color: 'var(--danger)', 
                                      borderColor: isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)' 
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.opacity = '0.8'
                                      e.currentTarget.style.borderColor = 'var(--danger)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.opacity = '1'
                                      e.currentTarget.style.borderColor = isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)'
                                    }}
                                    title="Remove route"
                                  >
                                    <i className="fas fa-trash"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleClose}
                      className="px-6 py-3 rounded-lg font-semibold transition-colors"
                      style={{
                        backgroundColor: isLightMode ? '#6c757d' : '#4e5560',
                        color: '#ffffff'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isLightMode ? '#5a6268' : '#3d4248'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isLightMode ? '#6c757d' : '#4e5560'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={routes.loading}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {routes.loading ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          Saving...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-save"></i>
                          Save Routes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Route Proxies Tab */}
              {routes.activeTab === 'proxies' && (
                <div className="animate-fadeIn">
                  <RouteProxyList tunnelId={routes.currentTunnelId} />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <i className="fas fa-server text-5xl opacity-50 mb-4" style={{ color: 'var(--text-tertiary)' }}></i>
              <h3 className="text-lg mb-2" style={{ color: 'var(--text-primary)' }}>No tunnel selected</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Please select a tunnel to configure routes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default RoutesModal

