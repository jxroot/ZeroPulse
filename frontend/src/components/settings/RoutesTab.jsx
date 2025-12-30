import { useState, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadTunnels } from '../../store/slices/tunnelsSlice'
import api from '../../utils/api'
import { alertSuccess, alertError, formatErrorMessage } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'

const RoutesTab = () => {
  const dispatch = useDispatch()
  const tunnels = useSelector(state => state.tunnels.tunnels)
  const tunnelsLoading = useSelector(state => state.tunnels.loading)
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  
  const [selectedTunnelId, setSelectedTunnelId] = useState(null)
  const [routes, setRoutes] = useState([])
  const [defaultHostname, setDefaultHostname] = useState('')
  const [winrmUsername, setWinrmUsername] = useState('')
  const [winrmPassword, setWinrmPassword] = useState('')
  const [winrmNtlmHash, setWinrmNtlmHash] = useState('')
  const [sshHostname, setSshHostname] = useState('')
  const [sshUsername, setSshUsername] = useState('')
  const [sshPassword, setSshPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [dnsRecords, setDnsRecords] = useState([])
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  useEffect(() => {
    if (tunnels.length === 0 && !tunnelsLoading) {
      dispatch(loadTunnels())
    }
  }, [dispatch, tunnels.length, tunnelsLoading])

  const selectTunnel = (tunnelId) => {
    if (selectedTunnelId === tunnelId) {
      setSelectedTunnelId(null)
      setRoutes([])
      setDefaultHostname('')
      setWinrmUsername('')
      setWinrmPassword('')
      setWinrmNtlmHash('')
      setSshHostname('')
      setSshUsername('')
      setSshPassword('')
      setResult(null)
      setDnsRecords([])
    } else {
      setSelectedTunnelId(tunnelId)
      loadRoutes(tunnelId)
    }
  }

  const loadRoutes = async (tunnelId) => {
    setLoading(true)
    setResult(null)
    setDnsRecords([])

    try {
      const response = await api.get(`/tunnels/${tunnelId}/routes`)

      if (response.data.success) {
        const ingress = response.data.ingress || []
        
        // Infer type from service if type is missing (fallback for backward compatibility)
        let processedIngress = ingress.map(route => {
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
        
        // Ensure catch-all is at the end
        const catchAllIndex = processedIngress.findIndex(r => r.service === 'http_status:404')
        if (catchAllIndex !== -1 && catchAllIndex !== processedIngress.length - 1) {
          const catchAll = processedIngress.splice(catchAllIndex, 1)[0]
          processedIngress.push(catchAll)
        }
        
        // If no catch-all, add one
        if (processedIngress.length === 0 || processedIngress[processedIngress.length - 1].service !== 'http_status:404') {
          processedIngress.push({ service: 'http_status:404' })
        }
        
        setRoutes(processedIngress)
        setDefaultHostname(response.data.default_hostname || '')
        setWinrmUsername(response.data.winrm_username || '')
        setWinrmPassword(response.data.winrm_password || '')
        setWinrmNtlmHash(response.data.winrm_ntlm_hash || '')
        setSshHostname(response.data.ssh_hostname || '')
        setSshUsername(response.data.ssh_username || '')
        setSshPassword(response.data.ssh_password || '')
        setDomain(response.data.domain || '')
      } else {
        await alertError(response.data.message || 'Failed to load routes')
      }
    } catch (err) {
      await alertError(err.response?.data || err, 'Error')
    } finally {
      setLoading(false)
    }
  }

  const addRoute = () => {
    // Insert before catch-all if exists
    const catchAllIndex = routes.findIndex(r => r.service === 'http_status:404')
    const newRoute = {
      hostname: '',
      path: '',
      type: '',
      service: 'tcp://localhost:5986'
    }
    
    if (catchAllIndex !== -1) {
      setRoutes([...routes.slice(0, catchAllIndex), newRoute, ...routes.slice(catchAllIndex)])
    } else {
      setRoutes([...routes, newRoute])
    }
  }

  const removeRoute = (index) => {
    // Don't remove if it's the only route (catch-all)
    if (routes[index].service === 'http_status:404' && routes.length === 1) {
      return
    }
    
    const newRoutes = routes.filter((_, i) => i !== index)
    
    // Ensure catch-all exists at the end
    const hasCatchAll = newRoutes.some(r => r.service === 'http_status:404')
    if (!hasCatchAll && newRoutes.length > 0) {
      newRoutes.push({ service: 'http_status:404' })
    }
    
    setRoutes(newRoutes)
  }

  const updateRoute = (index, field, value) => {
    const newRoutes = [...routes]
    newRoutes[index] = { ...newRoutes[index], [field]: value }
    setRoutes(newRoutes)
  }

  const updateServiceByType = (index, type) => {
    if (!type || routes[index]?.service === 'http_status:404') {
      return
    }
    
    const typeServiceMap = {
      'HTTP': 'http://localhost:80',
      'HTTPS': 'https://localhost:443',
      'TCP': 'tcp://localhost:5986',
      'SSH': 'ssh://localhost:22'
    }
    
    const currentService = routes[index]?.service || ''
    
    // Update service if:
    // 1. Service is empty
    // 2. Service matches a default value from typeServiceMap
    // 3. Service is the old default 'tcp://localhost:5986'
    const isDefaultService = !currentService.trim() || 
      Object.values(typeServiceMap).includes(currentService) ||
      currentService === 'tcp://localhost:5986'
    
    if (isDefaultService && typeServiceMap[type]) {
      updateRoute(index, 'service', typeServiceMap[type])
    } else {
      updateRoute(index, 'type', type)
    }
  }

  const saveRoutes = async () => {
    if (!selectedTunnelId) {
      await alertError('No tunnel selected')
      return
    }

    setSaving(true)
    setResult(null)
    setDnsRecords([])

    try {
      // Filter out empty routes and ensure catch-all is at the end
      let validRoutes = routes.filter(route => {
        if (route.service === 'http_status:404') return true // Keep catch-all
        
        // For TCP and SSH, hostname is required
        const isTCP = route.type === 'TCP' || route.service?.startsWith('tcp://')
        const isSSH = route.type === 'SSH' || route.service?.startsWith('ssh://')
        
        if (isTCP || isSSH) {
          // TCP and SSH require hostname, type, and service
          return route.hostname && route.type && route.service
        }
        
        // For other types (HTTP, HTTPS), hostname is optional but type and service are required
        return route.type && route.service
      })
      
      // Ensure catch-all is at the end
      const catchAllIndex = validRoutes.findIndex(r => r.service === 'http_status:404')
      if (catchAllIndex !== -1 && catchAllIndex !== validRoutes.length - 1) {
        const catchAll = validRoutes.splice(catchAllIndex, 1)[0]
        validRoutes.push(catchAll)
      }
      
      // If no catch-all, add one
      if (validRoutes.length === 0 || validRoutes[validRoutes.length - 1].service !== 'http_status:404') {
        validRoutes.push({ service: 'http_status:404' })
      }

      const response = await api.put(`/tunnels/${selectedTunnelId}/routes`, {
        ingress: validRoutes,
        default_hostname: defaultHostname,
        winrm_username: winrmUsername,
        winrm_password: winrmPassword,
        winrm_ntlm_hash: winrmNtlmHash,
        ssh_hostname: sshHostname,
        ssh_username: sshUsername,
        ssh_password: sshPassword
      })

      if (response.data.success) {
        setDnsRecords(response.data.dns_records || [])
        setResult({
          success: true,
          message: 'Routes and configuration updated successfully!'
        })
        await alertSuccess('Routes and configuration updated successfully!')
        // Reload routes to get updated data
        await loadRoutes(selectedTunnelId)
      } else {
        const errorData = response.data
        const errorMessage = formatErrorMessage(errorData)
        setResult({
          success: false,
          message: errorMessage
        })
        // Don't show alert modal, error is shown in result section below
      }
    } catch (err) {
      const errorData = err.response?.data || err
      const errorMessage = formatErrorMessage(errorData)
      setResult({
        success: false,
        message: errorMessage
      })
      // Don't show alert modal, error is shown in result section below
    } finally {
      setSaving(false)
    }
  }

  // Group tunnels by group_id
  const groupedTunnels = useMemo(() => {
    const groups = {}
    const ungrouped = []

    tunnels.forEach(tunnel => {
      if (tunnel.group_id && tunnel.group_name) {
        if (!groups[tunnel.group_id]) {
          groups[tunnel.group_id] = {
            id: tunnel.group_id,
            name: tunnel.group_name,
            color: tunnel.group_color || '#667eea',
            tunnels: []
          }
        }
        groups[tunnel.group_id].tunnels.push(tunnel)
      } else {
        ungrouped.push(tunnel)
      }
    })

    return { groups, ungrouped }
  }, [tunnels])

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  const renderTunnelCard = (tunnel) => (
    <div
      key={tunnel.id}
      className="border rounded-lg overflow-hidden transition-all shadow-lg"
      style={{
        borderColor: selectedTunnelId === tunnel.id 
          ? 'var(--accent-primary)' 
          : 'var(--border-color)',
        backgroundColor: selectedTunnelId === tunnel.id 
          ? (isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)')
          : 'var(--bg-quaternary)'
      }}
    >
      <div
        onClick={() => selectTunnel(tunnel.id)}
        className="p-4 cursor-pointer flex items-center justify-between transition-colors"
        style={{
          backgroundColor: selectedTunnelId === tunnel.id 
            ? (isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)')
            : 'transparent'
        }}
        onMouseEnter={(e) => {
          if (selectedTunnelId !== tunnel.id) {
            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
          }
        }}
        onMouseLeave={(e) => {
          if (selectedTunnelId !== tunnel.id) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg"
            style={{
              background: isLightMode 
                ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }}
          >
            <i className="fas fa-server"></i>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {tunnel.name || tunnel.label || 'Unnamed Tunnel'}
            </div>
            <div className="text-sm font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
              {tunnel.id}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className="px-3 py-1 rounded text-xs font-semibold uppercase border"
            style={{
              backgroundColor: tunnel.status === 'healthy'
                ? (isLightMode ? 'rgba(40, 167, 69, 0.15)' : 'rgba(40, 167, 69, 0.2)')
                : (isLightMode ? 'rgba(220, 53, 69, 0.15)' : 'rgba(220, 53, 69, 0.2)'),
              color: tunnel.status === 'healthy' ? 'var(--success)' : 'var(--danger)',
              borderColor: tunnel.status === 'healthy'
                ? (isLightMode ? 'rgba(40, 167, 69, 0.3)' : 'rgba(40, 167, 69, 0.3)')
                : (isLightMode ? 'rgba(220, 53, 69, 0.3)' : 'rgba(220, 53, 69, 0.3)')
            }}
          >
            {tunnel.status === 'healthy' ? 'Healthy' : 'Down'}
          </span>
          <i
            className={`fas transition-transform ${
              selectedTunnelId === tunnel.id ? 'fa-chevron-up' : 'fa-chevron-down'
            }`}
            style={{ color: 'var(--text-secondary)' }}
          ></i>
        </div>
      </div>

      {/* Routes Configuration for Selected Tunnel */}
      {selectedTunnelId === tunnel.id && (
        <div className="p-6 border-t space-y-6" style={{ borderTopColor: 'var(--border-color)' }}>
          {loading ? (
            <LoadingSpinner message="Loading routes..." />
          ) : (
            <>
              {/* Default Data for WinRM */}
              <div className="border rounded-lg p-4" style={{ backgroundColor: 'var(--bg-quaternary)', borderColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.2)' }}>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderBottomColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.2)' }}>
                  <i className="fas fa-cog" style={{ color: 'var(--accent-primary)' }}></i>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Default Data for WinRM</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-globe text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                      Hostname
                    </label>
                    <input
                      type="text"
                      value={defaultHostname}
                      onChange={(e) => setDefaultHostname(e.target.value)}
                      className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                      placeholder="e.g., tunnel.example.com"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-user text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                      Username
                    </label>
                    <input
                      type="text"
                      value={winrmUsername}
                      onChange={(e) => setWinrmUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
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
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-lock text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                      Password
                    </label>
                    <input
                      type="password"
                      value={winrmPassword}
                      onChange={(e) => setWinrmPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
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
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-hashtag text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                      NTLM Hash
                    </label>
                    <input
                      type="text"
                      value={winrmNtlmHash}
                      onChange={(e) => setWinrmNtlmHash(e.target.value)}
                      className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
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
                  <div 
                    className="flex items-start gap-2 p-3 rounded border-l-2 text-sm"
                    style={{
                      backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)',
                      borderLeftColor: 'var(--accent-primary)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <i className="fas fa-info-circle mt-0.5" style={{ color: 'var(--accent-primary)' }}></i>
                    <span>This hostname and credentials will be used for WinRM connections. Must be configured before using WinRM features.</span>
                  </div>
                </div>
              </div>

              {/* Default Data for SSH */}
              <div className="border rounded-lg p-4" style={{ backgroundColor: 'var(--bg-quaternary)', borderColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.2)' }}>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderBottomColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.2)' }}>
                  <i className="fas fa-key" style={{ color: 'var(--accent-primary)' }}></i>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Default Data for SSH</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-globe text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                      Hostname
                    </label>
                    <input
                      type="text"
                      value={sshHostname}
                      onChange={(e) => setSshHostname(e.target.value)}
                      className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                      placeholder="e.g., tunnel.example.com"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-user text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                      Username
                    </label>
                    <input
                      type="text"
                      value={sshUsername}
                      onChange={(e) => setSshUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
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
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-lock text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                      Password
                    </label>
                    <input
                      type="password"
                      value={sshPassword}
                      onChange={(e) => setSshPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
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
                  <div 
                    className="flex items-start gap-2 p-3 rounded border-l-2 text-sm"
                    style={{
                      backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)',
                      borderLeftColor: 'var(--accent-primary)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <i className="fas fa-info-circle mt-0.5" style={{ color: 'var(--accent-primary)' }}></i>
                    <span>This hostname and credentials will be used for SSH connections. SSH private key is automatically used from <code className="px-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>/root/.ssh/id_ed25519</code> if password is not provided.</span>
                  </div>
                </div>
              </div>

              {/* Routes List */}
              <div className="border rounded-lg p-4" style={{ backgroundColor: 'var(--bg-quaternary)', borderColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.2)' }}>
                <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderBottomColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.2)' }}>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-route" style={{ color: 'var(--accent-primary)' }}></i>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Ingress Rules</span>
                    {routes.length > 0 && (
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>({routes.length})</span>
                    )}
                  </div>
                  <button
                    onClick={addRoute}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold text-sm transition-all hover:shadow-lg"
                    style={{
                      background: isLightMode 
                        ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    }}
                  >
                    <i className="fas fa-plus"></i>
                    <span>Add Route</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {routes.length === 0 ? (
                    <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fas fa-route text-5xl mb-4 opacity-30" style={{ color: 'var(--text-tertiary)' }}></i>
                      <p className="mb-4" style={{ color: 'var(--text-primary)' }}>No routes configured</p>
                      <button
                        onClick={addRoute}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-white font-semibold text-sm transition-all hover:shadow-lg"
                        style={{
                          background: isLightMode 
                            ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        }}
                      >
                        <i className="fas fa-plus"></i>
                        Add Your First Route
                      </button>
                    </div>
                  ) : (
                    routes.map((route, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-4 transition-all"
                        style={{
                          backgroundColor: route.service === 'http_status:404'
                            ? (isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)')
                            : 'var(--bg-tertiary)',
                          borderColor: route.service === 'http_status:404'
                            ? (isLightMode ? 'rgba(102, 126, 234, 0.3)' : 'rgba(102, 126, 234, 0.4)')
                            : 'var(--border-color)'
                        }}
                        onMouseEnter={(e) => {
                          if (route.service !== 'http_status:404') {
                            e.currentTarget.style.borderColor = 'var(--accent-primary)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (route.service !== 'http_status:404') {
                            e.currentTarget.style.borderColor = 'var(--border-color)'
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderBottomColor: 'var(--border-color)' }}>
                          <div className="text-sm font-bold px-3 py-1 rounded" style={{ color: 'var(--accent-primary)', backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.15)' : 'rgba(102, 126, 234, 0.2)' }}>
                            #{index + 1}
                          </div>
                          {route.service === 'http_status:404' ? (
                            <div className="flex items-center gap-2 px-3 py-1 rounded text-xs font-semibold uppercase border" style={{ color: 'var(--accent-primary)', backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.15)' : 'rgba(102, 126, 234, 0.2)', borderColor: 'var(--accent-primary)' }}>
                              <i className="fas fa-asterisk"></i>
                              Catch-all Route
                            </div>
                          ) : (
                            <button
                              onClick={() => removeRoute(index)}
                              className="w-9 h-9 flex items-center justify-center rounded bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-all"
                              title="Remove Route"
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {/* Subdomain */}
                          <div>
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                              <i className="fas fa-globe text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                              Subdomain
                              <span className="text-xs font-normal lowercase" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={(() => {
                                  const hostname = route.hostname || ''
                                  if (!hostname || !domain) return ''
                                  if (hostname === domain) return ''
                                  if (hostname.endsWith(`.${domain}`)) {
                                    return hostname.slice(0, -(domain.length + 1))
                                  }
                                  return ''
                                })()}
                                onChange={(e) => {
                                  const subdomain = e.target.value.trim()
                                  const fullHostname = subdomain ? `${subdomain}.${domain}` : domain
                                  updateRoute(index, 'hostname', fullHostname)
                                }}
                                readOnly={route.service === 'http_status:404' || !domain}
                                className="flex-1 px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
                                style={{
                                  backgroundColor: route.service === 'http_status:404' || !domain ? 'var(--bg-quaternary)' : 'var(--bg-secondary)',
                                  borderColor: 'var(--border-color)',
                                  color: route.service === 'http_status:404' || !domain ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                  cursor: route.service === 'http_status:404' || !domain ? 'not-allowed' : 'text'
                                }}
                                onFocus={(e) => {
                                  if (route.service !== 'http_status:404' && domain) {
                                    e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                  }
                                }}
                                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                placeholder="subdomain"
                              />
                              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>.</span>
                            </div>
                          </div>
                          
                          {/* Domain */}
                          <div>
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                              <i className="fas fa-globe text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                              Domain
                              <span className="text-xs font-normal lowercase" style={{ color: 'var(--danger)' }}>(Required)</span>
                            </label>
                            <input
                              type="text"
                              value={domain || ''}
                              readOnly
                              className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
                              style={{
                                backgroundColor: 'var(--bg-quaternary)',
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-primary)',
                                cursor: 'not-allowed'
                              }}
                              placeholder="Select or type to search..."
                            />
                          </div>
                          
                          {/* Path */}
                          <div>
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                              <i className="fas fa-code text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                              Path
                              <span className="text-xs font-normal lowercase" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                            </label>
                            <input
                              type="text"
                              value={route.path || ''}
                              onChange={(e) => updateRoute(index, 'path', e.target.value)}
                              readOnly={route.service === 'http_status:404'}
                              className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
                              style={{
                                backgroundColor: route.service === 'http_status:404' ? 'var(--bg-quaternary)' : 'var(--bg-secondary)',
                                borderColor: 'var(--border-color)',
                                color: route.service === 'http_status:404' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                cursor: route.service === 'http_status:404' ? 'not-allowed' : 'text'
                              }}
                              onFocus={(e) => {
                                if (route.service !== 'http_status:404') {
                                  e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                }
                              }}
                              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                              placeholder="/api/*"
                            />
                          </div>
                          
                          {/* Type */}
                          <div>
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                              <i className="fas fa-tag text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                              Type <span className="text-xs" style={{ color: 'var(--danger)' }}>(Required)</span>
                            </label>
                            <div className="relative">
                              <select
                                value={route.type || ''}
                                onChange={(e) => updateServiceByType(index, e.target.value)}
                                disabled={route.service === 'http_status:404'}
                                className="w-full px-3 py-2 pr-10 rounded border text-sm focus:outline-none transition-colors appearance-none"
                                style={{
                                  backgroundColor: route.service === 'http_status:404' ? 'var(--bg-quaternary)' : 'var(--bg-secondary)',
                                  borderColor: route.service === 'http_status:404' ? 'var(--border-color)' : 'var(--border-color)',
                                  color: route.service === 'http_status:404' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                  cursor: route.service === 'http_status:404' ? 'not-allowed' : 'pointer'
                                }}
                                onFocus={(e) => {
                                  if (route.service !== 'http_status:404') {
                                    e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                  }
                                }}
                                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                              >
                                <option value="" disabled>Select...</option>
                                <option value="HTTP">HTTP</option>
                                <option value="HTTPS">HTTPS</option>
                                <option value="TCP">TCP</option>
                                <option value="SSH">SSH</option>
                              </select>
                              <i className="fas fa-chevron-down absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }}></i>
                            </div>
                          </div>
                        </div>
                        
                        {/* Service Row */}
                        <div className="mt-4">
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <i className="fas fa-server text-xs" style={{ color: 'var(--accent-primary)' }}></i>
                            Service
                          </label>
                          <input
                            type="text"
                            value={route.service || ''}
                            onChange={(e) => updateRoute(index, 'service', e.target.value)}
                            readOnly={route.service === 'http_status:404'}
                            className="w-full px-3 py-2 rounded border font-mono text-sm focus:outline-none transition-colors"
                            style={{
                              backgroundColor: route.service === 'http_status:404' ? 'var(--bg-quaternary)' : 'var(--bg-secondary)',
                              borderColor: 'var(--border-color)',
                              color: route.service === 'http_status:404' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                              cursor: route.service === 'http_status:404' ? 'not-allowed' : 'text'
                            }}
                            onFocus={(e) => {
                              if (route.service !== 'http_status:404') {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                              }
                            }}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                            placeholder="tcp://localhost:5986"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Result Message and DNS Records Status */}
                {(result || dnsRecords.length > 0) && (
                  <div className="mt-4 space-y-3">
                    {/* Result Message */}
                    {result && (
                      <div
                        className="p-4 rounded-lg border"
                        style={{
                          backgroundColor: result.success
                            ? (isLightMode ? 'rgba(40, 167, 69, 0.08)' : 'rgba(40, 167, 69, 0.15)')
                            : (isLightMode ? 'rgba(220, 53, 69, 0.08)' : 'rgba(220, 53, 69, 0.15)'),
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
                          <strong style={{ color: result.success ? 'var(--success)' : 'var(--danger)' }}>
                            {result.message}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* DNS Records Status */}
                    {dnsRecords.length > 0 && (
                      <div className="p-4 rounded-lg border-l-2" style={{ backgroundColor: 'var(--bg-quaternary)', borderLeftColor: 'var(--accent-primary)' }}>
                        <div className="text-xs font-semibold uppercase mb-3 tracking-wide" style={{ color: 'var(--text-primary)' }}>
                          DNS Records Status
                        </div>
                        <div className="space-y-2">
                          {dnsRecords.map((dns, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 p-2 rounded text-sm"
                              style={{
                                backgroundColor: dns.dns_created || dns.dns_deleted
                                  ? (isLightMode ? 'rgba(40, 167, 69, 0.08)' : 'rgba(40, 167, 69, 0.1)')
                                  : (isLightMode ? 'rgba(220, 53, 69, 0.08)' : 'rgba(220, 53, 69, 0.1)'),
                                color: dns.dns_created || dns.dns_deleted ? 'var(--success)' : 'var(--danger)'
                              }}
                            >
                              <i
                                className={`fas ${
                                  dns.dns_created || dns.dns_deleted ? 'fa-check-circle' : 'fa-times-circle'
                                }`}
                              ></i>
                              <span className="font-mono font-medium flex-1">{dns.hostname}</span>
                              <span className="text-xs opacity-80">
                                {dns.action === 'deleted'
                                  ? dns.dns_deleted
                                    ? 'Deleted'
                                    : 'Failed to Delete'
                                  : dns.dns_created
                                    ? dns.action === 'created'
                                      ? 'Created'
                                      : 'Updated'
                                    : 'Failed'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderTopColor: 'var(--border-color)' }}>
                <button
                  onClick={saveRoutes}
                  disabled={saving}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-semibold transition-all ${
                    saving
                      ? 'opacity-50 cursor-wait'
                      : 'hover:shadow-lg'
                  }`}
                  style={{
                    background: saving
                      ? (isLightMode ? 'rgba(102, 126, 234, 0.5)' : 'rgba(102, 126, 234, 0.5)')
                      : (isLightMode 
                          ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)')
                  }}
                >
                  {saving ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save"></i>
                      <span>Save Configuration</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Tunnels List */}
      {tunnels.length > 0 ? (
        <div className="space-y-4">
          {/* Grouped Tunnels */}
          {Object.values(groupedTunnels.groups).map((group) => {
            const isGroupExpanded = expandedGroups.has(group.id)
            return (
              <div key={group.id} className="card overflow-hidden">
                <div
                  className="px-4 py-3 cursor-pointer flex items-center justify-between border-b transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-quaternary)',
                    borderBottomColor: 'var(--border-color)'
                  }}
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center gap-3">
                    <i className={`fas fa-chevron-${isGroupExpanded ? 'down' : 'right'} text-sm`} style={{ color: 'var(--text-secondary)' }}></i>
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {group.name}
                    </span>
                    <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      {group.tunnels.length} {group.tunnels.length === 1 ? 'tunnel' : 'tunnels'}
                    </span>
                  </div>
                </div>
                {isGroupExpanded && (
                  <div className="p-4 space-y-3">
                    {group.tunnels.map((tunnel) => renderTunnelCard(tunnel))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Ungrouped Tunnels */}
          {groupedTunnels.ungrouped.length > 0 && (
            <div className="card overflow-hidden">
              <div
                className="px-4 py-3 cursor-pointer flex items-center justify-between border-b transition-colors"
                style={{
                  backgroundColor: 'var(--bg-quaternary)',
                  borderBottomColor: 'var(--border-color)'
                }}
                onClick={() => toggleGroup('ungrouped')}
              >
                <div className="flex items-center gap-3">
                  <i className={`fas fa-chevron-${expandedGroups.has('ungrouped') ? 'down' : 'right'} text-sm`} style={{ color: 'var(--text-secondary)' }}></i>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Ungrouped
                  </span>
                  <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    {groupedTunnels.ungrouped.length} {groupedTunnels.ungrouped.length === 1 ? 'tunnel' : 'tunnels'}
                  </span>
                </div>
              </div>
              {expandedGroups.has('ungrouped') && (
                <div className="p-4 space-y-3">
                  {groupedTunnels.ungrouped.map((tunnel) => renderTunnelCard(tunnel))}
                </div>
              )}
            </div>
          )}

          {/* Fallback: If no groups and no ungrouped, show all tunnels */}
          {Object.keys(groupedTunnels.groups).length === 0 && groupedTunnels.ungrouped.length === 0 && tunnels.length > 0 && (
            <div className="space-y-3">
              {tunnels.map((tunnel) => renderTunnelCard(tunnel))}
            </div>
          )}
        </div>
      ) : tunnelsLoading ? (
        <div className="text-center py-10">
          <LoadingSpinner message="Loading tunnels..." />
        </div>
      ) : (
        <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
          <i className="fas fa-server text-5xl mb-4 opacity-30" style={{ color: 'var(--text-tertiary)' }}></i>
          <p style={{ color: 'var(--text-primary)' }}>No tunnels found</p>
        </div>
      )}
    </div>
  )
}

export default RoutesTab
