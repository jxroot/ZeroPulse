import { useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { updateTunnelLabel, disconnectConnection } from '../../store/slices/tunnelsSlice'
import { openModal } from '../../store/slices/modulesSlice'
import { openModal as openRoutesModal } from '../../store/slices/routesSlice'
import { formatDate } from '../../utils/helpers'
import ConnectModal from '../modals/ConnectModal'
import ModuleModalDynamic from '../modals/ModuleModalDynamic'

const TunnelTableRow = ({ tunnel }) => {
  const dispatch = useDispatch()
  const tunnelsState = useSelector(state => state.tunnels)
  
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [isSavingLabel, setIsSavingLabel] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [pendingConnectionType, setPendingConnectionType] = useState(null)

  const winrmStatus = useMemo(() => {
    return tunnelsState.winrmStatus[tunnel.id] || { status: 'unknown', port: null, message: null }
  }, [tunnelsState.winrmStatus, tunnel.id])

  const sshStatus = useMemo(() => {
    return tunnelsState.sshStatus[tunnel.id] || { status: 'unknown', port: null, message: null }
  }, [tunnelsState.sshStatus, tunnel.id])

  const isCheckingConnections = useMemo(() => {
    return tunnelsState.restoringConnections && tunnel.status === 'healthy'
  }, [tunnelsState.restoringConnections, tunnel.status])

  const startEditingLabel = () => {
    setLabelInput(tunnel.label || '')
    setIsEditingLabel(true)
  }

  const cancelEditingLabel = () => {
    setIsEditingLabel(false)
    setLabelInput('')
  }

  const saveLabel = async () => {
    if (isSavingLabel) return
    setIsSavingLabel(true)
    try {
      await dispatch(updateTunnelLabel({ 
        tunnelId: tunnel.id, 
        label: labelInput.trim() || null 
      })).unwrap()
      setIsEditingLabel(false)
      setLabelInput('')
    } catch (err) {
      console.error('Error updating label:', err)
    } finally {
      setIsSavingLabel(false)
    }
  }

  const handleDisconnect = async () => {
    if (isDisconnecting) return
    setIsDisconnecting(true)
    try {
      const disconnectPromises = []
      if (winrmStatus.status === 'working') {
        disconnectPromises.push(
          dispatch(disconnectConnection({ tunnelId: tunnel.id, connectionType: 'winrm' })).unwrap()
        )
      }
      if (sshStatus.status === 'working') {
        disconnectPromises.push(
          dispatch(disconnectConnection({ tunnelId: tunnel.id, connectionType: 'ssh' })).unwrap()
        )
      }
      if (disconnectPromises.length > 0) {
        await Promise.allSettled(disconnectPromises)
      }
    } catch (err) {
      console.error('Error disconnecting:', err)
    } finally {
      setIsDisconnecting(false)
    }
  }

  const statusBorderColor = tunnel.status === 'healthy' 
    ? 'border-l-4 border-l-green-500' 
    : 'border-l-4 border-l-red-500'

  return (
    <>
    <tr 
      className="transition-colors"
      style={{
        borderLeft: `4px solid ${tunnel.status === 'healthy' ? '#10b981' : '#ef4444'}`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      {/* Name */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tunnel.name}</div>
        <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{tunnel.id.substring(0, 8)}...</div>
      </td>

      {/* Label */}
      <td className="px-4 py-3 whitespace-nowrap">
        {!isEditingLabel ? (
          <div className="flex items-center gap-2">
            {tunnel.label ? (
              <span 
                onClick={startEditingLabel}
                className="text-xs px-2 py-1 rounded border cursor-pointer hover:text-purple-400 transition-colors"
                style={{ 
                  color: 'var(--text-secondary)', 
                  backgroundColor: 'var(--bg-quaternary)', 
                  borderColor: 'var(--border-color)' 
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#a855f7'
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'
                }}
                title="Click to edit label"
              >
                {tunnel.label}
              </span>
            ) : (
              <span 
                onClick={startEditingLabel}
                className="text-xs italic cursor-pointer hover:text-purple-400 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                title="Click to add label"
              >
                No label
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyUp={(e) => {
                if (e.key === 'Enter') saveLabel()
                if (e.key === 'Escape') cancelEditingLabel()
              }}
              className="flex-1 rounded px-2 py-1 text-xs outline-none focus:border-purple-500"
              style={{ 
                backgroundColor: 'var(--bg-secondary)', 
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
                border: '1px solid'
              }}
              placeholder="Enter label..."
              maxLength={50}
              autoFocus
            />
            <button
              onClick={saveLabel}
              disabled={isSavingLabel}
              className="text-green-400 hover:text-green-300 transition-colors"
              title="Save"
            >
              <i className={`fas ${isSavingLabel ? 'fa-spinner fa-spin' : 'fa-check'} text-xs`}></i>
            </button>
            <button
              onClick={cancelEditingLabel}
              className="text-red-400 hover:text-red-300 transition-colors"
              title="Cancel"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          </div>
        )}
      </td>

      {/* WinRM */}
      <td className="px-4 py-3 whitespace-nowrap">
        {tunnel.status === 'healthy' ? (
          <div className="flex items-center gap-2">
            {isCheckingConnections && winrmStatus.status === 'unknown' ? (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <i className="fas fa-spinner fa-spin text-[10px]"></i>
                <span className="opacity-70">Checking...</span>
              </span>
            ) : winrmStatus.status === 'working' ? (
              <div className="relative w-4 h-4 inline-block">
                <span className="status-indicator status-online absolute bottom-0 right-0 border-2 border-gray-800"></span>
              </div>
            ) : winrmStatus.status === 'failed' ? (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <i className="fas fa-times-circle"></i>
                Failed
              </span>
            ) : (
              <div className="relative w-4 h-4 inline-block">
                <span className="status-indicator status-offline absolute bottom-0 right-0 border-2 border-gray-800"></span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>-</span>
        )}
      </td>

      {/* SSH */}
      <td className="px-4 py-3 whitespace-nowrap">
        {tunnel.status === 'healthy' ? (
          <div className="flex items-center gap-2">
            {isCheckingConnections && sshStatus.status === 'unknown' ? (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <i className="fas fa-spinner fa-spin text-[10px]"></i>
                <span className="opacity-70">Checking...</span>
              </span>
            ) : sshStatus.status === 'working' ? (
              <div className="relative w-4 h-4 inline-block">
                <span className="status-indicator status-online absolute bottom-0 right-0 border-2 border-gray-800"></span>
              </div>
            ) : sshStatus.status === 'failed' ? (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <i className="fas fa-times-circle"></i>
                Failed
              </span>
            ) : (
              <div className="relative w-4 h-4 inline-block">
                <span className="status-indicator status-offline absolute bottom-0 right-0 border-2 border-gray-800"></span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>-</span>
        )}
      </td>

      {/* Origin IP */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
          {tunnel.connections?.[0]?.origin_ip || <span style={{ color: 'var(--text-secondary)' }}>N/A</span>}
        </span>
      </td>

      {/* Created */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(tunnel.created_at)}</span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {tunnel.status === 'healthy' ? (
            (winrmStatus.status === 'working' || sshStatus.status === 'working') ? (
              <>
                <button
                  onClick={() => dispatch(openModal(tunnel.id))}
                  className="px-2 py-1 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded text-xs font-semibold hover:shadow-lg transition-all"
                  title="Open Module Manager"
                >
                  <i className="fas fa-cube"></i>
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="px-2 py-1 bg-gradient-to-r from-[#dc3545] to-[#c82333] text-white rounded text-xs font-semibold hover:shadow-lg transition-all disabled:opacity-70"
                  title="Disconnect"
                >
                  <i className={`fas ${isDisconnecting ? 'fa-spinner fa-spin' : 'fa-unlink'}`}></i>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setPendingConnectionType(null)
                  setShowConnectModal(true)
                }}
                className="px-2 py-1 bg-gradient-to-r from-[#28a745] to-[#20c997] text-white rounded text-xs font-semibold hover:shadow-lg transition-all"
                title="Connect"
              >
                <i className="fas fa-plug"></i>
              </button>
            )
          ) : (
            <button
              className="px-2 py-1 rounded text-xs font-semibold opacity-50 cursor-not-allowed"
              style={{ backgroundColor: 'var(--bg-quaternary)', color: 'var(--text-secondary)' }}
              disabled
              title="Tunnel is offline"
            >
              <i className="fas fa-plug"></i>
            </button>
          )}
          <button
            onClick={() => dispatch(openRoutesModal({ tunnelId: tunnel.id }))}
            className="px-2 py-1 bg-gradient-to-r from-[#6c757d] to-[#5a6268] text-white rounded text-xs font-semibold hover:shadow-lg transition-all"
            title="Configure Routes"
          >
            <i className="fas fa-route"></i>
          </button>
        </div>
      </td>
    </tr>
    {showConnectModal && (
      <ConnectModal
        tunnel={tunnel}
        initialConnectionType={pendingConnectionType}
        onClose={() => {
          setShowConnectModal(false)
          setPendingConnectionType(null)
        }}
      />
    )}
  </>
  )
}

export default TunnelTableRow

