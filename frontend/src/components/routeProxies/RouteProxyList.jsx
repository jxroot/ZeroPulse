import { useState, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadRouteProxies, startRouteProxy, stopRouteProxy } from '../../store/slices/routeProxiesSlice'
import LoadingSpinner from '../common/LoadingSpinner'
import { alertError, confirm } from '../../utils/alert'
import api from '../../utils/api'

const RouteProxyList = ({ tunnelId, proxies: providedProxies }) => {
  const dispatch = useDispatch()
  const routeProxies = useSelector(state => state.routeProxies)
  const theme = useSelector(state => state.theme.theme)
  const [localPorts, setLocalPorts] = useState({})
  const [focusedInputIndex, setFocusedInputIndex] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  
  const isLightMode = theme === 'light'

  // Use provided proxies if available, otherwise use from state
  const proxies = providedProxies || (tunnelId ? routeProxies.proxies : [])

  useEffect(() => {
    // Only load if proxies not provided and tunnelId is available
    if (tunnelId && !providedProxies) {
      dispatch(loadRouteProxies(tunnelId))
    }
  }, [dispatch, tunnelId, providedProxies])

  // Group proxies by hostname
  const groupedProxies = useMemo(() => {
    const groups = {}
    const ungrouped = []

    proxies.forEach(proxy => {
      const hostname = proxy.hostname
      if (hostname) {
        if (!groups[hostname]) {
          groups[hostname] = {
            hostname: hostname,
            proxies: []
          }
        }
        groups[hostname].proxies.push(proxy)
      } else {
        ungrouped.push(proxy)
      }
    })

    return { groups, ungrouped }
  }, [proxies])

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }

  const getProxyUniqueKey = (proxy) => {
    return `${proxy.hostname || 'ungrouped'}-${proxy.target_port}-${proxy.route_type || 'tcp'}`
  }

  const handleStartProxy = async (proxy, uniqueKey) => {
    const localPort = localPorts[uniqueKey] ? parseInt(localPorts[uniqueKey]) : null
    
    if (localPort && (isNaN(localPort) || localPort < 1 || localPort > 65535)) {
      alertError('Please enter a valid port number (1-65535)', 'Invalid Port')
      return
    }

    try {
      await dispatch(startRouteProxy({
        hostname: proxy.hostname,
        targetPort: proxy.target_port,
        localPort: localPort,
        routeType: proxy.route_type || 'tcp',
        tunnelId: tunnelId
      })).unwrap()
      // Clear local port input
      setLocalPorts(prev => {
        const newPorts = { ...prev }
        delete newPorts[uniqueKey]
        return newPorts
      })
    } catch (err) {
      alertError(err || 'Failed to start route proxy', 'Error')
    }
  }

  const handleStopProxy = async (proxy) => {
    const serviceName = proxy.route_type === 'ttyd' ? 'ttyd' : proxy.route_type === 'novnc' ? 'novnc' : 'route proxy'
    const confirmed = await confirm(
      `Stop ${serviceName} for ${proxy.hostname}:${proxy.target_port}?`,
      `Stop ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}`
    )
    if (!confirmed) {
      return
    }

    try {
      // Handle ttyd and novnc separately
      if (proxy.route_type === 'ttyd') {
        await api.post(`/commands/stop-ttyd/${tunnelId}`)
        // Refresh proxies
        await dispatch(loadRouteProxies(tunnelId))
      } else if (proxy.route_type === 'novnc') {
        await api.post(`/commands/stop-novnc/${tunnelId}`)
        // Refresh proxies
        await dispatch(loadRouteProxies(tunnelId))
      } else {
        // Regular route proxy
        await dispatch(stopRouteProxy({
          hostname: proxy.hostname,
          targetPort: proxy.target_port,
          localPort: proxy.local_port || null,
          tunnelId: tunnelId
        })).unwrap()
      }
    } catch (err) {
      alertError(err?.response?.data?.detail || err?.message || `Failed to stop ${serviceName}`, 'Error')
    }
  }

  const getProxyKey = (hostname, targetPort) => {
    return `${hostname}:${targetPort}`
  }

  const checkIsStarting = (proxy) => {
    const key = getProxyKey(proxy.hostname, proxy.target_port)
    return routeProxies.proxyOperations[key] === 'starting'
  }

  const checkIsStopping = (proxy) => {
    const key = getProxyKey(proxy.hostname, proxy.target_port)
    return routeProxies.proxyOperations[key] === 'stopping'
  }

  if (routeProxies.loading && proxies.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoadingSpinner message="Loading route proxies..." />
      </div>
    )
  }

  if (proxies.length === 0) {
    return (
      <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
        <i className="fas fa-network-wired text-4xl opacity-30 mb-3 block" style={{ color: 'var(--text-tertiary)' }}></i>
        <p style={{ color: 'var(--text-secondary)' }}>No TCP routes found. Add a TCP route (e.g., tcp://localhost:5900) to create a proxy.</p>
      </div>
    )
  }

  const renderProxyItem = (proxy, uniqueKey) => (
    <div
      key={uniqueKey}
      className="p-4 border rounded-lg transition-colors"
      style={{
        backgroundColor: isLightMode ? 'rgba(233, 236, 239, 0.5)' : 'rgba(42, 42, 62, 0.5)',
        borderColor: 'var(--border-color)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.3)' : 'rgba(102, 126, 234, 0.5)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-color)'
      }}
    >
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <span
              className="font-bold"
              style={{
                color: proxy.is_running ? 'var(--success)' : 'var(--text-tertiary)'
              }}
            >
              {proxy.is_running ? '🟢 Active' : '⚫ Inactive'}
            </span>
            <span
              className="px-2 py-0.5 text-xs font-semibold rounded text-white"
              style={{
                backgroundColor: proxy.route_type === 'ssh'
                  ? '#17a2b8'
                  : proxy.route_type === 'ttyd'
                  ? '#2563eb'
                  : proxy.route_type === 'novnc'
                  ? '#16a34a'
                  : isLightMode ? '#6b7280' : '#4b5563'
              }}
            >
              {proxy.route_type === 'ssh' ? 'SSH' : proxy.route_type === 'ttyd' ? 'TTYD' : proxy.route_type === 'novnc' ? 'NoVNC' : 'TCP'}
            </span>
            <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
              {proxy.route_type === 'ttyd' ? (
                <>
                  ttyd → localhost:{proxy.local_port}
                  {proxy.ssh_user && proxy.ssh_host && proxy.ssh_port && (
                    <span style={{ color: 'var(--text-secondary)' }}> | SSH: {proxy.ssh_user}@{proxy.ssh_host}:{proxy.ssh_port}</span>
                  )}
                </>
              ) : proxy.route_type === 'novnc' ? (
                <>
                  novnc → localhost:{proxy.local_port}
                  {proxy.vnc_host && proxy.vnc_port && (
                    <span style={{ color: 'var(--text-secondary)' }}> | VNC: {proxy.vnc_host}:{proxy.vnc_port}</span>
                  )}
                </>
              ) : (
                <>
                  {proxy.hostname}:{proxy.target_port}
                  {proxy.local_port && (
                    <span style={{ color: 'var(--text-secondary)' }}> → localhost:{proxy.local_port}</span>
                  )}
                </>
              )}
            </span>
          </div>
          {proxy.is_running && proxy.local_port && (
            <div className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Listen Port: <strong style={{ color: 'var(--accent-primary)' }}>{proxy.local_port}</strong>
              {proxy.route_type === 'ttyd' && proxy.pid && (
                <span> | PID: <strong style={{ color: 'var(--accent-primary)' }}>{proxy.pid}</strong></span>
              )}
              {proxy.route_type === 'novnc' && proxy.pid && (
                <span> | PID: <strong style={{ color: 'var(--accent-primary)' }}>{proxy.pid}</strong></span>
              )}
            </div>
          )}
          {proxy.is_running && proxy.uptime_formatted && (
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Uptime: <strong style={{ color: 'var(--success)' }}>{proxy.uptime_formatted}</strong>
              {proxy.idle_formatted && (
                <span> | Idle: <strong style={{ color: 'var(--warning)' }}>{proxy.idle_formatted}</strong></span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {proxy.is_running ? (
            <button
              onClick={() => handleStopProxy(proxy)}
              disabled={checkIsStopping(proxy)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 min-w-[110px] justify-center ${
                checkIsStopping(proxy)
                  ? 'cursor-wait'
                  : 'bg-gradient-to-r from-[#dc3545] to-[#c82333] text-white hover:shadow-lg hover:-translate-y-0.5'
              }`}
              style={checkIsStopping(proxy) ? {
                backgroundColor: isLightMode ? '#adb5bd' : '#4b5563',
                color: isLightMode ? '#495057' : '#9ca3af'
              } : {}}
              title="Stop Route Proxy"
            >
              {checkIsStopping(proxy) ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Stopping...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-stop-circle"></i>
                  <span>Stop</span>
                </>
              )}
            </button>
          ) : (
            <>
              <div 
                className="relative flex items-center border-2 rounded-xl px-3 py-2 min-w-[120px] transition-all"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: focusedInputIndex === uniqueKey ? 'var(--accent-primary)' : 'var(--border-color)',
                  boxShadow: focusedInputIndex === uniqueKey ? '0 0 0 3px rgba(102, 126, 234, 0.1)' : 'none'
                }}
              >
                <i className="fas fa-network-wired text-sm mr-2" style={{ color: 'var(--accent-primary)' }}></i>
                <input
                  type="number"
                  value={localPorts[uniqueKey] || ''}
                  onChange={(e) => setLocalPorts(prev => ({ ...prev, [uniqueKey]: e.target.value }))}
                  onFocus={() => setFocusedInputIndex(uniqueKey)}
                  onBlur={() => setFocusedInputIndex(null)}
                  placeholder="Port"
                  min="1"
                  max="65535"
                  disabled={checkIsStarting(proxy)}
                  className="bg-transparent border-none outline-none text-sm font-mono font-semibold w-full min-w-[60px]"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <button
                onClick={() => handleStartProxy(proxy, uniqueKey)}
                disabled={checkIsStarting(proxy)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 min-w-[110px] justify-center ${
                  checkIsStarting(proxy)
                    ? 'cursor-wait'
                    : 'bg-gradient-to-r from-[#28a745] to-[#20c997] text-white hover:shadow-lg hover:-translate-y-0.5'
                }`}
                style={checkIsStarting(proxy) ? {
                  backgroundColor: isLightMode ? '#adb5bd' : '#4b5563',
                  color: isLightMode ? '#495057' : '#9ca3af'
                } : {}}
                title="Start Route Proxy"
              >
                {checkIsStarting(proxy) ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-play-circle"></i>
                    <span>Start</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Grouped Proxies */}
      {Object.values(groupedProxies.groups).map((group) => {
        const isExpanded = expandedGroups.has(group.hostname)
        return (
          <div key={group.hostname} className="card overflow-hidden">
            <div
              className="px-4 py-3 cursor-pointer flex items-center justify-between border-b transition-colors"
              style={{
                backgroundColor: 'var(--bg-quaternary)',
                borderBottomColor: 'var(--border-color)'
              }}
              onClick={() => toggleGroup(group.hostname)}
            >
              <div className="flex items-center gap-3">
                <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-sm`} style={{ color: 'var(--text-secondary)' }}></i>
                <i className="fas fa-globe text-sm" style={{ color: 'var(--accent-primary)' }}></i>
                <span className="font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {group.hostname}
                </span>
                <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  {group.proxies.length} {group.proxies.length === 1 ? 'proxy' : 'proxies'}
                </span>
              </div>
            </div>
            {isExpanded && (
              <div className="p-4 space-y-3">
                {group.proxies.map((proxy) => renderProxyItem(proxy, getProxyUniqueKey(proxy)))}
              </div>
            )}
          </div>
        )
      })}

      {/* Ungrouped Proxies */}
      {groupedProxies.ungrouped.length > 0 && (
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
                {groupedProxies.ungrouped.length} {groupedProxies.ungrouped.length === 1 ? 'proxy' : 'proxies'}
              </span>
            </div>
          </div>
          {expandedGroups.has('ungrouped') && (
            <div className="p-4 space-y-3">
              {groupedProxies.ungrouped.map((proxy) => renderProxyItem(proxy, getProxyUniqueKey(proxy)))}
            </div>
          )}
        </div>
      )}

      {/* Fallback: If no groups and no ungrouped, show all proxies */}
      {Object.keys(groupedProxies.groups).length === 0 && groupedProxies.ungrouped.length === 0 && proxies.length > 0 && (
        <div className="space-y-3">
          {proxies.map((proxy) => renderProxyItem(proxy, getProxyUniqueKey(proxy)))}
        </div>
      )}
    </div>
  )
}

export default RouteProxyList

