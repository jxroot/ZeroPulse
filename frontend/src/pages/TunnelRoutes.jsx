import { useEffect, useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadTunnels } from '../store/slices/tunnelsSlice'
import { setActiveTab } from '../store/slices/routesSlice'
import { loadRouteProxies, loadAllRouteProxies, killAllRouteProxies } from '../store/slices/routeProxiesSlice'
import MainLayout from '../components/Layout/MainLayout'
import LoadingSpinner from '../components/common/LoadingSpinner'
import RouteProxyList from '../components/routeProxies/RouteProxyList'
import { alertSuccess, alertError, confirm } from '../utils/alert'

const REFRESH_INTERVAL = 30000 // 30 seconds

const TunnelRoutes = () => {
  const dispatch = useDispatch()
  const tunnels = useSelector(state => state.tunnels)
  const routes = useSelector(state => state.routes)
  const routeProxies = useSelector(state => state.routeProxies)
  const theme = useSelector(state => state.theme.theme)
  
  const isLightMode = theme === 'light'
  
  // Track which tunnels are expanded (dropdowns opened)
  const [expandedTunnels, setExpandedTunnels] = useState(new Set())
  
  // Track active status for each tunnel (to show Active badge in header)
  const [tunnelActiveStatus, setTunnelActiveStatus] = useState({})
  
  // Load autoRefresh from localStorage, default to true
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem('routeProxiesAutoRefresh')
    return saved !== null ? saved === 'true' : true
  })
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000) // Countdown in seconds
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)

  // Save autoRefresh to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('routeProxiesAutoRefresh', autoRefresh.toString())
  }, [autoRefresh])

  // Load tunnels only once
  useEffect(() => {
    if (!tunnels.tunnelsLoaded) {
      dispatch(loadTunnels())
    }
  }, [dispatch, tunnels.tunnelsLoaded])

  // Set active tab to proxies by default (separate effect to avoid re-triggering loadTunnels)
  useEffect(() => {
    if (routes.activeTab !== 'proxies') {
      dispatch(setActiveTab('proxies'))
    }
  }, [dispatch, routes.activeTab])

  // Load active status for all tunnels when tunnels are loaded (initial load)
  useEffect(() => {
    if (tunnels.tunnelsLoaded && tunnels.tunnels.length > 0) {
      // Load proxies for all tunnels to check active status
      tunnels.tunnels.forEach(tunnel => {
        dispatch(loadRouteProxies(tunnel.id)).catch(() => {
          // Ignore errors - status will be updated via the central useEffect
        })
      })
    }
  }, [dispatch, tunnels.tunnelsLoaded, tunnels.tunnels.length])

  // Update active status when proxies are loaded/changed
  useEffect(() => {
    const allProxies = routeProxies.allProxies || {}
    const newActiveStatus = {}
    
    // Update active status for all tunnels that have loaded proxies
    tunnels.tunnels.forEach(tunnel => {
      const proxies = allProxies[tunnel.id]
      if (proxies && Array.isArray(proxies)) {
        newActiveStatus[tunnel.id] = proxies.some(proxy => proxy.is_running === true)
      }
    })
    
    // Only update if there are changes
    if (Object.keys(newActiveStatus).length > 0) {
      setTunnelActiveStatus(prev => ({
        ...prev,
        ...newActiveStatus
      }))
    }
  }, [routeProxies.allProxies, tunnels.tunnels])

  // Load proxies for a tunnel when it's expanded
  useEffect(() => {
    expandedTunnels.forEach(tunnelId => {
      const proxies = routeProxies.allProxies?.[tunnelId]
      // Only load if not already loaded (undefined means not loaded yet)
      if (proxies === undefined) {
        dispatch(loadRouteProxies(tunnelId))
      }
    })
  }, [dispatch, expandedTunnels, routeProxies.allProxies])

  // Trigger refresh when countdown reaches 0 - refresh expanded tunnels and update active status for all
  useEffect(() => {
    if (!autoRefresh || !tunnels.tunnelsLoaded) return
    if (countdown === 0 && !routeProxies.loading) {
      // Reload route proxies for expanded tunnels
      if (expandedTunnels.size > 0) {
        expandedTunnels.forEach(tunnelId => {
          dispatch(loadRouteProxies(tunnelId))
        })
      }
      // Also refresh active status for all tunnels
      tunnels.tunnels.forEach(tunnel => {
        dispatch(loadRouteProxies(tunnel.id))
      })
      // Reset countdown after triggering refresh
      setCountdown(REFRESH_INTERVAL / 1000)
    }
  }, [countdown, autoRefresh, tunnels.tunnelsLoaded, tunnels.tunnels, routeProxies.loading, dispatch, expandedTunnels])

  // Auto-refresh route proxies periodically
  useEffect(() => {
    if (!tunnels.tunnelsLoaded) return

    // Clear existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }

    // Start interval if auto-refresh is enabled
    if (autoRefresh) {
      // Reset countdown when auto-refresh is enabled
      setCountdown(REFRESH_INTERVAL / 1000)

      // Countdown timer - decrement every second
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            return 0 // Set to 0 to trigger refresh via useEffect
          }
          return prev - 1
        })
      }, 1000)

      // Refresh interval - actual refresh logic (backup in case countdown logic fails)
      intervalRef.current = setInterval(() => {
        // Reload route proxies for expanded tunnels and update active status for all
        if (!routeProxies.loading) {
          if (expandedTunnels.size > 0) {
            expandedTunnels.forEach(tunnelId => {
              dispatch(loadRouteProxies(tunnelId))
            })
          }
          // Also refresh active status for all tunnels
          tunnels.tunnels.forEach(tunnel => {
            dispatch(loadRouteProxies(tunnel.id))
          })
          // Reset countdown after refresh
          setCountdown(REFRESH_INTERVAL / 1000)
        }
      }, REFRESH_INTERVAL)
    } else {
      // Clear countdown when auto-refresh is disabled
      setCountdown(REFRESH_INTERVAL / 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }
  }, [dispatch, tunnels.tunnelsLoaded, routeProxies.loading, autoRefresh, expandedTunnels])

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => !prev)
  }

  const handleRefresh = async () => {
    // Refresh expanded tunnels and update active status for all tunnels
    const refreshPromises = []
    
    if (expandedTunnels.size > 0) {
      expandedTunnels.forEach(tunnelId => {
        refreshPromises.push(dispatch(loadRouteProxies(tunnelId)))
      })
    }
    
    // Also refresh active status for all tunnels
    tunnels.tunnels.forEach(tunnel => {
      refreshPromises.push(dispatch(loadRouteProxies(tunnel.id)))
    })
    
    await Promise.all(refreshPromises)
    
    // Reset countdown after manual refresh if auto-refresh is enabled
    if (autoRefresh) {
      setCountdown(REFRESH_INTERVAL / 1000)
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
      // Refresh expanded tunnels and update active status for all tunnels
      const refreshPromises = []
      
      if (expandedTunnels.size > 0) {
        expandedTunnels.forEach(tunnelId => {
          refreshPromises.push(dispatch(loadRouteProxies(tunnelId)))
        })
      }
      
      // Update active status for all tunnels (should be false after kill all)
      tunnels.tunnels.forEach(tunnel => {
        refreshPromises.push(dispatch(loadRouteProxies(tunnel.id)))
      })
      
      await Promise.all(refreshPromises)
      alertSuccess('All route proxies killed successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to kill all route proxies', 'Error')
    }
  }

  const toggleTunnelDropdown = (tunnelId) => {
    setExpandedTunnels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tunnelId)) {
        newSet.delete(tunnelId)
      } else {
        newSet.add(tunnelId)
      }
      return newSet
    })
  }

  // Get proxies only for expanded tunnels
  const allProxiesByTunnel = routeProxies.allProxies || {}
  const expandedProxiesByTunnel = {}
  expandedTunnels.forEach(tunnelId => {
    if (allProxiesByTunnel[tunnelId]) {
      expandedProxiesByTunnel[tunnelId] = allProxiesByTunnel[tunnelId]
    }
  })
  const hasProxies = Object.keys(expandedProxiesByTunnel).length > 0
  const totalProxiesCount = Object.values(expandedProxiesByTunnel).reduce((sum, proxies) => sum + (proxies?.length || 0), 0)

  // Helper function to check if a tunnel has active proxies
  const hasActiveProxies = (tunnelId) => {
    // First check the tunnelActiveStatus state (updated on load/refresh)
    if (tunnelActiveStatus[tunnelId] !== undefined) {
      return tunnelActiveStatus[tunnelId]
    }
    // Fallback to checking loaded proxies
    const proxies = allProxiesByTunnel[tunnelId]
    if (!proxies || !Array.isArray(proxies)) return false
    return proxies.some(proxy => proxy.is_running === true)
  }

  return (
    <MainLayout title="Route Proxies">
      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <i className="fas fa-network-wired" style={{ color: 'var(--accent-primary)' }}></i>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Route Proxies
                {tunnels.tunnels.length > 0 && (
                  <span className="font-normal ml-2" style={{ color: 'var(--text-tertiary)' }}>({tunnels.tunnels.length} total)</span>
                )}
              </h4>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleAutoRefresh}
                className={`inline-flex items-center justify-center px-3 py-2 border-none rounded-full cursor-pointer text-sm font-medium transition-all duration-300 ${
                  autoRefresh 
                    ? 'bg-[#28a745] text-white hover:bg-[#218838]' 
                    : 'bg-[#6c757d] text-white hover:bg-[#5a6268]'
                }`}
                title={autoRefresh ? `Auto-refresh enabled (next refresh in ${countdown}s)` : 'Auto-refresh disabled - Click to enable'}
              >
                <i className="fas fa-clock text-sm mr-1.5"></i>
                {autoRefresh ? (
                  <span className="text-xs font-mono">{countdown}s</span>
                ) : (
                  <span className="text-xs">Off</span>
                )}
              </button>
              <button
                onClick={handleRefresh}
                disabled={routeProxies.loading || expandedTunnels.size === 0}
                className="w-9 h-9 flex items-center justify-center bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Refresh"
              >
                <i className={`fas fa-sync-alt ${routeProxies.loading ? 'fa-spin' : ''}`}></i>
              </button>
              <button
                onClick={handleKillAllProxies}
                className="w-9 h-9 flex items-center justify-center bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/25 transition-colors"
                title="Kill All Route Proxies"
              >
                <i className="fas fa-stop-circle"></i>
              </button>
            </div>
          </div>

          {tunnels.loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner message="Loading tunnels..." />
            </div>
          ) : tunnels.tunnels.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
              <i className="fas fa-network-wired text-4xl opacity-30 mb-3 block" style={{ color: 'var(--text-tertiary)' }}></i>
              <p style={{ color: 'var(--text-secondary)' }}>No tunnels found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tunnels.tunnels.map((tunnel) => {
                const isExpanded = expandedTunnels.has(tunnel.id)
                const proxies = expandedProxiesByTunnel[tunnel.id]
                const isLoading = isExpanded && proxies === undefined
                
                return (
                  <div key={tunnel.id} className="space-y-3">
                    {/* Tunnel Header with Dropdown */}
                    <div 
                      className="bg-gradient-to-r from-purple-600/15 to-blue-600/15 border border-purple-500/30 rounded-lg p-3 cursor-pointer hover:border-purple-500/50 transition-colors"
                      onClick={() => toggleTunnelDropdown(tunnel.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-500 rounded-lg flex items-center justify-center text-white">
                          <i className="fas fa-server"></i>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Tunnel</div>
                            {hasActiveProxies(tunnel.id) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 border rounded-full text-xs font-semibold" style={{
                                backgroundColor: isLightMode ? 'rgba(40, 167, 69, 0.15)' : 'rgba(40, 167, 69, 0.2)',
                                borderColor: isLightMode ? 'rgba(40, 167, 69, 0.25)' : 'rgba(40, 167, 69, 0.3)',
                                color: 'var(--success)'
                              }}>
                                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--success)' }}></span>
                                Active
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>
                            {tunnel?.name || tunnel?.id || tunnel.id}
                            {tunnel?.status && (
                              <span className="ml-2 text-xs" style={{
                                color: tunnel.status === 'healthy' ? 'var(--success)' : 'var(--text-secondary)'
                              }}>
                                ({tunnel.status})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isExpanded && proxies && proxies.length > 0 && (
                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {proxies.length} {proxies.length === 1 ? 'proxy' : 'proxies'}
                            </div>
                          )}
                          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} transition-transform`} style={{ color: 'var(--text-secondary)' }}></i>
                        </div>
                      </div>
                    </div>
                    
                    {/* Route Proxies for this tunnel - shown when expanded */}
                    {isExpanded && (
                      <div className="ml-4 pl-4 border-l-2 border-purple-500/30">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <LoadingSpinner message="Loading route proxies..." />
                          </div>
                        ) : proxies && proxies.length === 0 ? (
                          <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                            <i className="fas fa-network-wired text-2xl opacity-30 mb-2 block" style={{ color: 'var(--text-tertiary)' }}></i>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No TCP routes found. Add a TCP route (e.g., tcp://localhost:5900) to create a proxy.</p>
                          </div>
                        ) : proxies && proxies.length > 0 ? (
                          <RouteProxyList tunnelId={tunnel.id} proxies={proxies} />
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}

export default TunnelRoutes
