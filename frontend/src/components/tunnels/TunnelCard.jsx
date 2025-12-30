import { useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { updateTunnelLabel, disconnectConnection } from '../../store/slices/tunnelsSlice'
import { formatDate } from '../../utils/helpers'

const TunnelCard = ({ tunnel }) => {
  const dispatch = useDispatch()
  const tunnelsState = useSelector(state => state.tunnels)
  
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [isSavingLabel, setIsSavingLabel] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)

  const winrmStatus = useMemo(() => {
    return tunnelsState.winrmStatus[tunnel.id] || { status: 'unknown', port: null, message: null }
  }, [tunnelsState.winrmStatus, tunnel.id])

  const sshStatus = useMemo(() => {
    return tunnelsState.sshStatus[tunnel.id] || { status: 'unknown', port: null, message: null }
  }, [tunnelsState.sshStatus, tunnel.id])

  const statusBadgeClass = tunnel.status === 'healthy' 
    ? 'bg-green-500 text-white' 
    : tunnel.status === 'inactive'
    ? 'bg-gray-500 text-white'
    : 'bg-red-500 text-white'
  
  const getStatusText = () => {
    if (tunnel.status === 'healthy') return 'Healthy'
    if (tunnel.status === 'inactive') return 'Inactive'
    return 'Down'
  }

  const activeConnectionTypes = useMemo(() => {
    const types = []
    if (winrmStatus.status === 'working') types.push('WinRM')
    if (sshStatus.status === 'working') types.push('SSH')
    return types
  }, [winrmStatus.status, sshStatus.status])

  const moduleButtonText = useMemo(() => {
    if (activeConnectionTypes.length === 0) return 'Module'
    if (activeConnectionTypes.length === 1) return `Module (${activeConnectionTypes[0]})`
    return `Module (${activeConnectionTypes.join(' + ')})`
  }, [activeConnectionTypes])

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

  const openConnectModal = () => {
    setShowConnectModal(true)
  }

  const closeConnectModal = () => {
    setShowConnectModal(false)
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

  return (
    <div 
      className="card p-4 flex flex-col min-h-[380px] hover:border-purple-500 transition-all"
      style={{
        opacity: tunnel.status === 'inactive' ? 0.6 : 1
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3.5 pb-3.5 border-b border-gray-800">
        <div className="flex-1 pr-3.5">
          <div className="text-base font-bold text-white mb-1 break-words">
            {tunnel.name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {!isEditingLabel ? (
              <div className="flex items-center gap-2 flex-1">
                {tunnel.label ? (
                  <span 
                    onClick={startEditingLabel}
                    className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded border border-gray-700 flex-1 truncate cursor-pointer hover:bg-gray-700 hover:text-purple-400 hover:border-purple-500 transition-all"
                    title="Click to edit label"
                  >
                    {tunnel.label}
                  </span>
                ) : (
                  <span 
                    onClick={startEditingLabel}
                    className="text-xs text-gray-500 italic cursor-pointer hover:text-purple-400 transition-colors"
                    title="Click to add label"
                  >
                    No label
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyUp={(e) => {
                    if (e.key === 'Enter') saveLabel()
                    if (e.key === 'Escape') cancelEditingLabel()
                  }}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                  placeholder="Enter label..."
                  maxLength={50}
                  autoFocus
                />
                <button
                  onClick={saveLabel}
                  disabled={isSavingLabel}
                  className="bg-transparent border-none text-green-400 cursor-pointer p-1 rounded hover:bg-green-500/10 transition-all w-6 h-6 flex items-center justify-center"
                  title="Save"
                >
                  <i className={`fas ${isSavingLabel ? 'fa-spinner fa-spin' : 'fa-check'} text-xs`}></i>
                </button>
                <button
                  onClick={cancelEditingLabel}
                  className="bg-transparent border-none text-red-400 cursor-pointer p-1 rounded hover:bg-red-500/10 transition-all w-6 h-6 flex items-center justify-center"
                  title="Cancel"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`px-3 py-1 rounded-xl text-xs font-semibold ${statusBadgeClass}`}>
            {getStatusText()}
          </span>
          {tunnel.status === 'healthy' && winrmStatus.port && (
            <span className="bg-[#667eea] text-white px-3 py-1 rounded-xl text-xs font-semibold" title="WinRM Port">
              WinRM: {winrmStatus.port}
            </span>
          )}
          {tunnel.status === 'healthy' && sshStatus.port && (
            <span className="bg-[#28a745] text-white px-3 py-1 rounded-xl text-xs font-semibold" title="SSH Port">
              SSH: {sshStatus.port}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-2.5 mb-3.5 min-h-[180px]">
        <div className="text-xs text-white">
          <strong>ID:</strong> <span className="font-mono text-xs">{tunnel.id}</span>
        </div>
        <div className="text-xs text-white">
          <strong>Connections:</strong> {tunnel.connections?.length || 0}
        </div>
        <div className="text-xs text-white">
          <strong>Origin IP:</strong> {tunnel.connections?.[0]?.origin_ip || <span className="text-gray-500">N/A</span>}
        </div>
        <div className="text-xs text-white">
          <strong>Created:</strong> {formatDate(tunnel.created_at)}
        </div>

        {/* WinRM Status */}
        {tunnel.status === 'healthy' && (winrmStatus.status !== 'unknown' || winrmStatus.message) && (
          <div className={`text-xs font-semibold rounded-lg p-2.5 flex items-center gap-1.5 mt-auto ${
            winrmStatus.status === 'working' 
              ? 'text-[#155724] bg-[rgba(40,167,69,0.1)] border border-[rgba(40,167,69,0.3)]'
              : 'text-[#dc3545] bg-[rgba(220,53,69,0.1)] border border-[rgba(220,53,69,0.3)]'
          }`}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 flex-1">
                {winrmStatus.status === 'working' ? (
                  <div className="relative w-4 h-4 inline-block flex-shrink-0">
                    <span className="status-indicator status-online absolute bottom-0 right-0 border-2 border-gray-800"></span>
                  </div>
                ) : (
                  <i className="fas fa-exclamation-triangle"></i>
                )}
                <span>
                  {winrmStatus.status === 'working' 
                    ? 'WinRM OK - Ready to execute commands'
                    : `WinRM: ${winrmStatus.message || 'Not connected'}`}
                </span>
              </div>
              {winrmStatus.status !== 'working' && (
                <button
                  onClick={openConnectModal}
                  className="ml-2 px-2 py-1 bg-transparent border border-current rounded text-xs font-semibold transition-all hover:bg-white/10"
                  title="Connect to Tunnel"
                >
                  <i className="fas fa-plug"></i>
                </button>
              )}
            </div>
          </div>
        )}

        {/* SSH Status */}
        {tunnel.status === 'healthy' && (sshStatus.status !== 'unknown' || sshStatus.message) && (
          <div className={`text-xs font-semibold rounded-lg p-2.5 flex items-center gap-1.5 mt-auto ${
            sshStatus.status === 'working' 
              ? 'text-[#155724] bg-[rgba(40,167,69,0.1)] border border-[rgba(40,167,69,0.3)]'
              : 'text-[#dc3545] bg-[rgba(220,53,69,0.1)] border border-[rgba(220,53,69,0.3)]'
          }`}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 flex-1">
                {sshStatus.status === 'working' ? (
                  <div className="relative w-4 h-4 inline-block flex-shrink-0">
                    <span className="status-indicator status-online absolute bottom-0 right-0 border-2 border-gray-800"></span>
                  </div>
                ) : (
                  <i className="fas fa-exclamation-triangle"></i>
                )}
                <span>
                  {sshStatus.status === 'working' 
                    ? 'SSH OK - Ready to execute commands'
                    : `SSH: ${sshStatus.message || 'Not connected'}`}
                </span>
              </div>
              {sshStatus.status !== 'working' && (
                <button
                  onClick={openConnectModal}
                  className="ml-2 px-2 py-1 bg-transparent border border-current rounded text-xs font-semibold transition-all hover:bg-white/10"
                  title="Connect to Tunnel"
                >
                  <i className="fas fa-plug"></i>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-3.5 border-t border-gray-800">
        {tunnel.status === 'healthy' ? (
          (winrmStatus.status === 'working' || sshStatus.status === 'working') ? (
            <>
              <button 
                onClick={() => {/* TODO: Open module modal */}}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer flex-1 justify-center bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:from-[#5568d3] hover:to-[#6a3d8f] hover:shadow-lg hover:-translate-y-0.5"
                title={moduleButtonText}
              >
                <i className="fas fa-cube"></i>
                <span>{moduleButtonText}</span>
              </button>
              <button 
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer flex-1 justify-center bg-gradient-to-r from-[#dc3545] to-[#c82333] text-white hover:from-[#c82333] hover:to-[#bd2130] hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
                title="Disconnect"
              >
                <i className={`fas ${isDisconnecting ? 'fa-spinner fa-spin' : 'fa-unlink'}`}></i>
                <span>Disconnect</span>
              </button>
              <button 
                onClick={() => {/* TODO: Open routes modal */}}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer flex-1 justify-center bg-gradient-to-r from-[#6c757d] to-[#5a6268] text-white hover:from-[#5a6268] hover:to-[#495057] hover:shadow-lg hover:-translate-y-0.5"
                title="Configure Routes"
              >
                <i className="fas fa-route"></i>
                <span>Routes</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={openConnectModal}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer flex-1 justify-center bg-gradient-to-r from-[#28a745] to-[#20c997] text-white hover:from-[#218838] hover:to-[#1aa179] hover:shadow-lg hover:-translate-y-0.5"
                title="Connect to Tunnel"
              >
                <i className="fas fa-plug"></i>
                <span>Connect</span>
              </button>
              <button 
                onClick={() => {/* TODO: Open routes modal */}}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer flex-1 justify-center bg-gradient-to-r from-[#6c757d] to-[#5a6268] text-white hover:from-[#5a6268] hover:to-[#495057] hover:shadow-lg hover:-translate-y-0.5"
                title="Configure Routes"
              >
                <i className="fas fa-route"></i>
                <span>Routes</span>
              </button>
            </>
          )
        ) : (
          <>
            <button
              className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer flex-1 justify-center bg-gradient-to-r from-[#28a745] to-[#20c997] text-white opacity-70 cursor-not-allowed"
              disabled
              title="Connect to Tunnel (offline)"
            >
              <i className="fas fa-plug"></i>
              <span>Connect</span>
            </button>
            <button 
              onClick={() => {/* TODO: Open routes modal */}}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer flex-1 justify-center bg-gradient-to-r from-[#6c757d] to-[#5a6268] text-white hover:from-[#5a6268] hover:to-[#495057] hover:shadow-lg hover:-translate-y-0.5"
              title="Configure Routes (offline)"
            >
              <i className="fas fa-route"></i>
              <span>Routes</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default TunnelCard

