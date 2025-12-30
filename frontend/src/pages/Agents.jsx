import { useEffect, useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadTunnels, refreshTunnels, restoreConnectionStatus } from '../store/slices/tunnelsSlice'
import MainLayout from '../components/Layout/MainLayout'
import TunnelList from '../components/tunnels/TunnelList'

const REFRESH_INTERVAL = 30000 // 30 seconds

const Agents = () => {
  const dispatch = useDispatch()
  const tunnels = useSelector(state => state.tunnels)
  // Load autoRefresh from localStorage, default to true
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem('agentsAutoRefresh')
    return saved !== null ? saved === 'true' : true
  })
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000) // Countdown in seconds
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)

  // Save autoRefresh to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('agentsAutoRefresh', autoRefresh.toString())
  }, [autoRefresh])

  useEffect(() => {
    const initializeTunnels = async () => {
      if (!tunnels.tunnelsLoaded) {
        await dispatch(loadTunnels())
        // After loading tunnels, restore connection status for healthy tunnels
        // This checks if there were active connections before page reload
        await dispatch(restoreConnectionStatus())
      }
    }
    initializeTunnels()
  }, [dispatch, tunnels.tunnelsLoaded])

  // Trigger refresh when countdown reaches 0
  useEffect(() => {
    if (!autoRefresh || !tunnels.tunnelsLoaded) return
    if (countdown === 0 && !tunnels.loading && !tunnels.restoringConnections) {
      // Use refreshTunnels to fetch from /api/tunnels/ and restore connection status
      dispatch(refreshTunnels())
      // Reset countdown after triggering refresh
      setCountdown(REFRESH_INTERVAL / 1000)
    }
  }, [countdown, autoRefresh, tunnels.tunnelsLoaded, tunnels.loading, tunnels.restoringConnections, dispatch])

  // Auto-refresh connection status periodically
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
        // Refresh tunnels list from /api/tunnels/ and restore connection status
        if (!tunnels.loading && !tunnels.restoringConnections) {
          dispatch(refreshTunnels())
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
  }, [dispatch, tunnels.tunnelsLoaded, tunnels.tunnels, tunnels.restoringConnections, autoRefresh])

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => !prev)
  }

  const handleRefresh = async () => {
    await dispatch(refreshTunnels())
    // Reset countdown after manual refresh if auto-refresh is enabled
    if (autoRefresh) {
      setCountdown(REFRESH_INTERVAL / 1000)
    }
  }

  const onlineCount = tunnels.tunnels.filter(t => t.status === 'healthy').length
  const totalCount = tunnels.tunnels.length

  return (
    <MainLayout title="Agents">
      <div className="space-y-6">
        {/* Refresh controls */}
        <div className="flex justify-end items-center gap-2">
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
            disabled={tunnels.loading || tunnels.restoringConnections}
            className="w-9 h-9 flex items-center justify-center bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <i className={`fas fa-sync-alt ${tunnels.loading || tunnels.restoringConnections ? 'fa-spin' : ''}`}></i>
          </button>
        </div>

        {/* Tunnel List - handles its own loading state */}
        <TunnelList />
      </div>
    </MainLayout>
  )
}

export default Agents

