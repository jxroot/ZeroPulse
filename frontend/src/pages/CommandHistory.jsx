import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadCommands, deleteCommand, clearHistory, exportToCSV, exportToJSON, setFilter } from '../store/slices/historySlice'
import { loadTunnels } from '../store/slices/tunnelsSlice'
import MainLayout from '../components/Layout/MainLayout'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { formatDate } from '../utils/helpers'
import { alertSuccess, alertError, confirm } from '../utils/alert'

const REFRESH_INTERVAL = 30000 // 30 seconds

const CommandHistory = () => {
  const dispatch = useDispatch()
  const history = useSelector(state => state.history)
  const tunnels = useSelector(state => state.tunnels)
  
  // Load autoRefresh from localStorage, default to true
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem('commandHistoryAutoRefresh')
    return saved !== null ? saved === 'true' : true
  })
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000) // Countdown in seconds
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTunnelId, setSelectedTunnelId] = useState('')
  const [successFilter, setSuccessFilter] = useState(null)
  const [expandedOutputs, setExpandedOutputs] = useState(new Set())
  const searchTimeoutRef = useRef(null)

  // Save autoRefresh to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('commandHistoryAutoRefresh', autoRefresh.toString())
  }, [autoRefresh])

  useEffect(() => {
    if (!tunnels.tunnelsLoaded) {
      dispatch(loadTunnels())
    }
    if (!history.historyLoaded) {
      dispatch(loadCommands())
    }
  }, [dispatch, tunnels.tunnelsLoaded, history.historyLoaded])

  // Trigger refresh when countdown reaches 0
  useEffect(() => {
    if (!autoRefresh || !history.historyLoaded) return
    if (countdown === 0 && !history.loading) {
      // Reload commands with current filters
      dispatch(loadCommands(true))
      // Reset countdown after triggering refresh
      setCountdown(REFRESH_INTERVAL / 1000)
    }
  }, [countdown, autoRefresh, history.historyLoaded, history.loading, dispatch])

  // Auto-refresh command history periodically
  useEffect(() => {
    if (!history.historyLoaded) return

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
        // Reload commands with current filters
        if (!history.loading) {
          dispatch(loadCommands(true))
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
  }, [dispatch, history.historyLoaded, history.loading, autoRefresh])

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => !prev)
  }

  const handleRefresh = async () => {
    await dispatch(loadCommands(true))
    // Reset countdown after manual refresh if auto-refresh is enabled
    if (autoRefresh) {
      setCountdown(REFRESH_INTERVAL / 1000)
    }
  }

  const debouncedSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      applyFilters()
    }, 500)
  }

  const applyFilters = () => {
    dispatch(setFilter({ key: 'tunnelId', value: selectedTunnelId || null }))
    dispatch(setFilter({ key: 'search', value: searchQuery || null }))
    dispatch(setFilter({ key: 'successOnly', value: successFilter }))
    dispatch(setFilter({ key: 'offset', value: 0 }))
    dispatch(loadCommands(true))
  }

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
    debouncedSearch()
  }

  const handleTunnelChange = (e) => {
    setSelectedTunnelId(e.target.value)
    applyFilters()
  }

  const handleSuccessFilterChange = (e) => {
    const value = e.target.value === '' ? null : e.target.value === 'true'
    setSuccessFilter(value)
    applyFilters()
  }

  const toggleOutput = (commandId) => {
    setExpandedOutputs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(commandId)) {
        newSet.delete(commandId)
      } else {
        newSet.add(commandId)
      }
      return newSet
    })
  }

  const handleDeleteCommand = async (commandId) => {
    const confirmed = await confirm('Are you sure you want to delete this command?', 'Delete Command')
    if (!confirmed) return

    try {
      await dispatch(deleteCommand(commandId)).unwrap()
      alertSuccess('Command deleted successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to delete command', 'Error')
    }
  }

  const handleClearHistory = async () => {
    const confirmed = await confirm(
      'Are you sure you want to clear all command history? This action cannot be undone.',
      'Clear History'
    )
    if (!confirmed) return

    try {
      const count = await dispatch(clearHistory(selectedTunnelId || null)).unwrap()
      alertSuccess(`Cleared ${count} command(s) from history`, 'Success')
    } catch (err) {
      alertError(err || 'Failed to clear history', 'Error')
    }
  }

  const handleExportCSV = async () => {
    try {
      await dispatch(exportToCSV(selectedTunnelId || null)).unwrap()
      alertSuccess('History exported to CSV successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to export CSV', 'Error')
    }
  }

  const handleExportJSON = async () => {
    try {
      await dispatch(exportToJSON(selectedTunnelId || null)).unwrap()
      alertSuccess('History exported to JSON successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to export JSON', 'Error')
    }
  }

  const previousPage = () => {
    const newOffset = Math.max(0, history.filters.offset - history.filters.limit)
    dispatch(setFilter({ key: 'offset', value: newOffset }))
    dispatch(loadCommands(true))
  }

  const nextPage = () => {
    const newOffset = history.filters.offset + history.filters.limit
    dispatch(setFilter({ key: 'offset', value: newOffset }))
    dispatch(loadCommands(true))
  }

  const isValidBase64Image = (str) => {
    if (!str || typeof str !== 'string') return false
    const cleaned = str.trim().replace(/\s/g, '')
    if (cleaned.length < 100) return false
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    if (!base64Regex.test(cleaned)) return false
    return cleaned.startsWith('/9j/') || cleaned.startsWith('iVBORw0KG') || cleaned.startsWith('/9j/4AAQ')
  }

  const extractBase64Image = (output, command) => {
    if (!output || typeof output !== 'string') return null
    
    if (command && (command.includes('ffmpeg') || command.includes('dshow'))) {
      const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0)
      for (const line of lines) {
        if (line.includes('[') || line.includes(']') || line.includes('Camera found') || line.includes('FFmpeg') || line.includes('Error')) {
          continue
        }
        const cleaned = line.replace(/\s/g, '')
        if (isValidBase64Image(cleaned)) {
          return cleaned
        }
      }
      const cleaned = output.trim().replace(/\s/g, '')
      if (isValidBase64Image(cleaned)) {
        return cleaned
      }
    }
    
    if (command && command.toLowerCase().trim() === 'screenshot') {
      const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0)
      for (const line of lines) {
        if (line.includes('[') || line.includes(']')) continue
        const cleaned = line.replace(/\s/g, '')
        if (isValidBase64Image(cleaned)) {
          return cleaned
        }
      }
      const cleaned = output.trim().replace(/\s/g, '')
      if (isValidBase64Image(cleaned)) {
        return cleaned
      }
    }
    
    return null
  }

  const getImageType = (command) => {
    if (!command || typeof command !== 'string') return 'Image'
    const cmd = command.toLowerCase().trim()
    if (cmd === 'screenshot') return 'Screenshot'
    if (cmd.includes('webcam') || cmd.includes('ffmpeg') || cmd.includes('dshow')) return 'Webcam Photo'
    return 'Image'
  }

  const downloadImage = (base64, commandId, imageType) => {
    try {
      const byteCharacters = atob(base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/jpeg' })
      
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = `${imageType.toLowerCase().replace(/\s+/g, '_')}_${commandId}_${Date.now()}.jpg`
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      alertSuccess('Image downloaded successfully', 'Success')
    } catch (error) {
      console.error('Error downloading image:', error)
      alertError('Failed to download image', 'Error')
    }
  }

  const getOutputLines = (output) => {
    if (!output) return 0
    return output.split('\n').length
  }

  if (history.loading && history.commands.length === 0) {
    return (
      <MainLayout title="Command History">
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner message="Loading command history..." />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout title="Command History">
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
            disabled={history.loading}
            className="w-9 h-9 flex items-center justify-center bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <i className={`fas fa-sync-alt ${history.loading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search commands or output..."
              className="w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500"
              style={{ 
                backgroundColor: 'var(--bg-tertiary)', 
                borderColor: 'var(--border-color)', 
                color: 'var(--text-primary)' 
              }}
            />
          </div>
          
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Tunnel</label>
            <select
              value={selectedTunnelId}
              onChange={handleTunnelChange}
              className="w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500"
              style={{ 
                backgroundColor: 'var(--bg-tertiary)', 
                borderColor: 'var(--border-color)', 
                color: 'var(--text-primary)' 
              }}
            >
              <option value="">All Tunnels</option>
              {tunnels.tunnels.map(tunnel => (
                <option key={tunnel.id} value={tunnel.id}>
                  {tunnel.name || tunnel.id}
                </option>
              ))}
            </select>
          </div>
          
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Status</label>
            <select
              value={successFilter === null ? '' : successFilter.toString()}
              onChange={handleSuccessFilterChange}
              className="w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500"
              style={{ 
                backgroundColor: 'var(--bg-tertiary)', 
                borderColor: 'var(--border-color)', 
                color: 'var(--text-primary)' 
              }}
            >
              <option value="">All</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
              style={{ 
                backgroundColor: 'var(--bg-tertiary)', 
                borderColor: 'var(--border-color)', 
                color: 'var(--text-primary)' 
              }}
            >
              <i className="fas fa-file-csv mr-1.5"></i>Export CSV
            </button>
            <button
              onClick={handleExportJSON}
              className="px-4 py-2 rounded-lg text-sm border transition-colors"
              style={{ 
                backgroundColor: 'var(--bg-tertiary)', 
                borderColor: 'var(--border-color)', 
                color: 'var(--text-primary)' 
              }}
            >
              <i className="fas fa-file-code mr-2"></i>Export JSON
            </button>
            <button
              onClick={handleClearHistory}
              className="px-4 py-2 rounded-lg bg-[#dc3545] text-white hover:bg-[#c82333] transition-colors"
            >
              <i className="fas fa-trash mr-2"></i>Clear
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] rounded-lg p-3 text-white">
            <div className="text-xs opacity-80 mb-1">Total Commands</div>
            <div className="text-xl font-bold">{history.stats.total}</div>
          </div>
          <div className="bg-gradient-to-r from-[#28a745] to-[#20c997] rounded-lg p-3 text-white">
            <div className="text-xs opacity-80 mb-1">Successful</div>
            <div className="text-xl font-bold">{history.stats.successful}</div>
          </div>
          <div className="bg-gradient-to-r from-[#dc3545] to-[#c82333] rounded-lg p-3 text-white">
            <div className="text-sm opacity-80 mb-1">Failed</div>
            <div className="text-2xl font-bold">{history.stats.failed}</div>
          </div>
          <div className="bg-gradient-to-r from-[#ffc107] to-[#ffaa00] rounded-lg p-4 text-white">
            <div className="text-sm opacity-80 mb-1">Success Rate</div>
            <div className="text-2xl font-bold">{history.stats.success_rate?.toFixed(1) || '0.0'}%</div>
          </div>
        </div>

        {/* Commands List */}
        {history.commands.length === 0 && !history.loading ? (
          <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
            No command history found.
          </div>
        ) : (
          <div className="space-y-3">
            {history.commands.map((command) => {
              const base64Image = extractBase64Image(command.output, command.command)
              const isExpanded = expandedOutputs.has(command.id)
              
              return (
                <div
                  key={command.id}
                  className="rounded-xl p-5 border transition-all duration-300 hover:shadow-xl"
                  style={{ 
                    backgroundColor: 'var(--bg-tertiary)', 
                    borderColor: 'var(--border-color)' 
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      {/* Status Badge and Metadata */}
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                            command.success
                              ? 'bg-gradient-to-r from-[#28a745] to-[#20c997] text-white'
                              : 'bg-gradient-to-r from-[#dc3545] to-[#c82333] text-white'
                          }`}
                        >
                          <i className={`fas ${command.success ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {command.success ? 'Success' : 'Failed'}
                        </span>
                        {command.connection_type && (
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            <span className="uppercase">{command.connection_type}</span>
                            {command.username && (
                              <span className="font-mono">• User: {command.username}</span>
                            )}
                            {command.connection_type.toLowerCase() === 'ssh' ? (
                              // For SSH, show Auth type (Password or Public Key)
                              command.password ? (
                                <span>• Auth: Password</span>
                              ) : (
                                <span>• Auth: Public Key</span>
                              )
                            ) : (
                              // For WinRM, show Password status
                              command.password && (
                                <span>• Password: Yes</span>
                              )
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fas fa-server"></i>
                          <span className="font-mono">{command.tunnel_id?.substring(0, 8) || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <i className="far fa-clock"></i>
                          <span>{formatDate(command.timestamp)}</span>
                        </div>
                        {command.exit_code !== null && command.exit_code !== undefined && (
                          <div
                            className={`flex items-center gap-2 text-xs ${
                              command.exit_code === 0 ? 'text-[#28a745]' : 'text-[#ffc107]'
                            }`}
                          >
                            <i className="fas fa-code"></i>
                            <span>Exit: {command.exit_code}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Command */}
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <i className="fas fa-terminal text-xs" style={{ color: 'var(--text-secondary)' }}></i>
                          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Command</span>
                        </div>
                        <div
                          className="font-mono text-sm px-4 py-3 rounded-lg border"
                          style={{ 
                            backgroundColor: 'var(--bg-secondary)', 
                            borderColor: 'var(--border-color)', 
                            color: 'var(--text-primary)' 
                          }}
                        >
                          {command.command}
                        </div>
                      </div>
                    </div>
                    
                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteCommand(command.id)}
                      className="ml-4 p-2 text-[#dc3545] hover:bg-[rgba(220,53,69,0.1)] rounded-lg transition-all duration-200 hover:scale-110"
                      title="Delete"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                  
                  {/* Output Section */}
                  {command.output && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-file-alt text-sm" style={{ color: 'var(--text-secondary)' }}></i>
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Output</span>
                          {command.output && (
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {base64Image ? (
                                '(Image captured)'
                              ) : (
                                `(${command.output.length} chars, ${getOutputLines(command.output)} lines)`
                              )}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleOutput(command.id)}
                          className="text-xs px-3 py-1 rounded-lg transition-colors"
                          style={{ 
                            backgroundColor: 'var(--bg-secondary)', 
                            color: 'var(--text-primary)' 
                          }}
                        >
                          <i className={`fas ${isExpanded ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          {isExpanded ? ' Hide' : ' Show'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div>
                          {/* Image Display */}
                          {base64Image ? (
                            <div>
                              <div className="mb-2">
                                <img
                                  src={`data:image/jpeg;base64,${base64Image}`}
                                  alt={getImageType(command.command)}
                                  className="max-w-full rounded-lg border"
                                  style={{ borderColor: 'var(--border-color)' }}
                                />
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <i className={`fas ${getImageType(command.command) === 'Screenshot' ? 'fa-camera' : 'fa-video'}`}></i>
                                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {getImageType(command.command)}
                                </span>
                              </div>
                              <button
                                onClick={() => downloadImage(base64Image, command.id, getImageType(command.command))}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:shadow-lg transition-all"
                              >
                                <i className="fas fa-download mr-2"></i>
                                Download Image
                              </button>
                            </div>
                          ) : (
                            <div
                              className="font-mono text-xs p-4 rounded-lg border max-h-80 overflow-y-auto"
                              style={{ 
                                backgroundColor: 'var(--bg-secondary)', 
                                borderColor: 'var(--border-color)', 
                                color: 'var(--text-primary)' 
                              }}
                            >
                              <pre className="whitespace-pre-wrap m-0">{command.output}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Error Section */}
                  {command.error && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-exclamation-triangle text-[#dc3545]"></i>
                        <span className="text-sm font-medium text-[#dc3545]">Error</span>
                      </div>
                      <div className="text-[#dc3545] font-mono text-xs p-4 rounded-lg border bg-[rgba(220,53,69,0.1)] border-[rgba(220,53,69,0.3)]">
                        {command.error}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {!history.loading && history.commands.length > 0 && (
          <div className="mt-6 flex justify-between items-center">
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Showing {history.filters.offset + 1} - {Math.min(history.filters.offset + history.filters.limit, history.total)} of {history.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={previousPage}
                disabled={history.filters.offset === 0}
                className="px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: 'var(--bg-tertiary)', 
                  borderColor: 'var(--border-color)', 
                  color: 'var(--text-primary)' 
                }}
              >
                Previous
              </button>
              <button
                onClick={nextPage}
                disabled={history.filters.offset + history.filters.limit >= history.total}
                className="px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: 'var(--bg-tertiary)', 
                  borderColor: 'var(--border-color)', 
                  color: 'var(--text-primary)' 
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

export default CommandHistory

