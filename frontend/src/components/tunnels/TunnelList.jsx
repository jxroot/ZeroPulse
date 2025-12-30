import { useState, useMemo, useEffect } from 'react'
import { useSelector } from 'react-redux'
import TunnelTableRow from './TunnelTableRow'
import LoadingSpinner from '../common/LoadingSpinner'

const TunnelList = () => {
  const tunnels = useSelector(state => state.tunnels.tunnels)
  const loading = useSelector(state => state.tunnels.loading)
  const error = useSelector(state => state.tunnels.error)
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  // Get display settings from localStorage with state
  const [hideUngrouped, setHideUngrouped] = useState(() => {
    const saved = localStorage.getItem('tunnelSettings_hideUngrouped')
    return saved !== null ? saved === 'true' : false
  })

  const [hideOffline, setHideOffline] = useState(() => {
    const saved = localStorage.getItem('tunnelSettings_hideOffline')
    return saved !== null ? saved === 'true' : false
  })

  const [hideInactive, setHideInactive] = useState(() => {
    const saved = localStorage.getItem('tunnelSettings_hideInactive')
    return saved !== null ? saved === 'true' : false
  })

  // Listen for localStorage changes and custom events
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'tunnelSettings_hideUngrouped') {
        setHideUngrouped(e.newValue === 'true')
      } else if (e.key === 'tunnelSettings_hideOffline') {
        setHideOffline(e.newValue === 'true')
      } else if (e.key === 'tunnelSettings_hideInactive') {
        setHideInactive(e.newValue === 'true')
      }
    }

    const handleCustomEvent = (e) => {
      if (e.detail.key === 'hideUngrouped') {
        setHideUngrouped(e.detail.value)
      } else if (e.detail.key === 'hideOffline') {
        setHideOffline(e.detail.value)
      } else if (e.detail.key === 'hideInactive') {
        setHideInactive(e.detail.value)
      }
    }

    // Listen for storage events (from other tabs/windows)
    window.addEventListener('storage', handleStorageChange)
    
    // Listen for custom events (from same tab)
    window.addEventListener('tunnelSettingsChanged', handleCustomEvent)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('tunnelSettingsChanged', handleCustomEvent)
    }
  }, [])

  // Filter tunnels based on settings
  const filteredTunnels = useMemo(() => {
    let filtered = tunnels
    
    // Filter offline tunnels if setting is enabled
    if (hideOffline) {
      filtered = filtered.filter(tunnel => tunnel.status === 'healthy')
    }
    
    // Filter inactive tunnels if setting is enabled
    if (hideInactive) {
      filtered = filtered.filter(tunnel => tunnel.status !== 'inactive')
    }
    
    return filtered
  }, [tunnels, hideOffline, hideInactive])

  // Group tunnels by group_id
  const groupedTunnels = useMemo(() => {
    const groups = {}
    const ungrouped = []

    filteredTunnels.forEach(tunnel => {
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
  }, [filteredTunnels])

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

  if (loading && tunnels.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner 
          message="Loading tunnels..."
        />
      </div>
    )
  }

  if (filteredTunnels.length === 0 && !loading) {
    return (
      <div className="text-center py-8 px-4">
        <i className="fas fa-server text-4xl opacity-50 mb-3" style={{ color: 'var(--text-secondary)' }}></i>
        <h3 className="m-0 mb-2 text-lg" style={{ color: 'var(--text-primary)' }}>No tunnels found</h3>
        <p className="m-0 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {hideOffline || hideInactive ? 'No tunnels found matching your filters' : 'Your tunnels will be displayed here'}
        </p>
      </div>
    )
  }

  const renderTable = (tunnelList) => (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[800px]">
        <thead style={{ backgroundColor: 'var(--bg-quaternary)', borderBottomColor: 'var(--border-color)' }} className="border-b">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Label</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>WinRM</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>SSH</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Origin IP</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Created</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Actions</th>
          </tr>
        </thead>
        <tbody style={{ borderTopColor: 'var(--border-color)' }} className="divide-y">
          {tunnelList.map((tunnel) => (
            <TunnelTableRow key={tunnel.id} tunnel={tunnel} />
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm border border-red-500/30">
          Error: {error}
        </div>
      )}

      {/* Grouped Tunnels */}
      {Object.values(groupedTunnels.groups).map((group) => {
        const isExpanded = expandedGroups.has(group.id)
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
                <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-sm`} style={{ color: 'var(--text-secondary)' }}></i>
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
            {isExpanded && renderTable(group.tunnels)}
          </div>
        )
      })}

      {/* Ungrouped Tunnels */}
      {!hideUngrouped && groupedTunnels.ungrouped.length > 0 && (
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
          {expandedGroups.has('ungrouped') && renderTable(groupedTunnels.ungrouped)}
        </div>
      )}

      {/* Fallback: If no groups and no ungrouped (or ungrouped hidden), show all tunnels in a single table */}
      {Object.keys(groupedTunnels.groups).length === 0 && (hideUngrouped || groupedTunnels.ungrouped.length === 0) && filteredTunnels.length > 0 && (
        <div className="card overflow-hidden">
          {renderTable(filteredTunnels)}
        </div>
      )}
    </div>
  )
}

export default TunnelList
