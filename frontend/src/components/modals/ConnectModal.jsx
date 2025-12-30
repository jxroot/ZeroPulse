import { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { createPortal } from 'react-dom'
import api from '../../utils/api'
import { updateWinRMStatusFromResponse, updateSSHStatusFromResponse } from '../../store/slices/tunnelsSlice'
import { openModal } from '../../store/slices/modulesSlice'
import TerminalModal from './TerminalModal'

const ConnectModal = ({ tunnel, initialConnectionType = null, onClose }) => {
  const dispatch = useDispatch()
  const tunnelsState = useSelector(state => state.tunnels)
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  
  const [step, setStep] = useState(1) // 1: Select type, 2: Enter details, 3: Result
  const [connectionType, setConnectionType] = useState(null) // 'winrm' or 'ssh'
  const [loading, setLoading] = useState(false)
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [error, setError] = useState(null)
  const [connectionResult, setConnectionResult] = useState(null)
  
  const [formData, setFormData] = useState({
    hostname: '',
    username: '',
    password: '',
    ntlmHash: ''
  })
  
  const [winrmAuthMethod, setWinrmAuthMethod] = useState('password') // 'password', 'certificate', 'ntlm'
  const [sshAuthMethod, setSshAuthMethod] = useState('publickey') // 'publickey', 'password'
  const [useEvilWinrm, setUseEvilWinrm] = useState(false)
  const [showTerminalModal, setShowTerminalModal] = useState(false)
  const [terminalCommand, setTerminalCommand] = useState(null)
  const [terminalTitle, setTerminalTitle] = useState('Terminal')
  const [hideConnectModal, setHideConnectModal] = useState(false)

  // Get connection status from store
  const winrmStatus = useMemo(() => {
    return tunnelsState.winrmStatus[tunnel.id] || { status: 'unknown', port: null, message: null }
  }, [tunnelsState.winrmStatus, tunnel.id])

  const sshStatus = useMemo(() => {
    return tunnelsState.sshStatus[tunnel.id] || { status: 'unknown', port: null, message: null }
  }, [tunnelsState.sshStatus, tunnel.id])

  const isWinRMConnected = winrmStatus.status === 'working'
  const isSSHConnected = sshStatus.status === 'working'

  const isFormValid = useMemo(() => {
    if (!formData.hostname || !formData.username) {
      return false
    }
    if (connectionType === 'winrm') {
      if (winrmAuthMethod === 'password' && !formData.password) {
        return false
      }
      if (winrmAuthMethod === 'ntlm' && !formData.ntlmHash) {
        return false
      }
      if (winrmAuthMethod === 'certificate') {
        return false // Certificate not implemented yet
      }
    }
    if (connectionType === 'ssh') {
      if (sshAuthMethod === 'password' && !formData.password) {
        return false
      }
    }
    return true
  }, [connectionType, formData, winrmAuthMethod, sshAuthMethod])

  const isAlreadyConnected = useMemo(() => {
    if (connectionType === 'winrm') {
      return isWinRMConnected
    }
    if (connectionType === 'ssh') {
      return isSSHConnected
    }
    return false
  }, [connectionType, isWinRMConnected, isSSHConnected])

  // Watch for initialConnectionType changes
  useEffect(() => {
    if (initialConnectionType && tunnel?.id) {
      setConnectionType(initialConnectionType)
      setStep(2)
      loadDefaultValues()
    }
  }, [initialConnectionType, tunnel?.id])

  const selectConnectionType = (type) => {
    setConnectionType(type)
    setFormData({
      hostname: '',
      username: '',
      password: '',
      ntlmHash: ''
    })
    setWinrmAuthMethod('password')
    setSshAuthMethod('publickey')
    setError(null)
  }

  const goToStep2 = async () => {
    if (!connectionType) return
    
    // Check if connection is already active
    if (connectionType === 'winrm' && isWinRMConnected) {
      return
    }
    if (connectionType === 'ssh' && isSSHConnected) {
      return
    }
    
    setStep(2)
    await loadDefaultValues()
  }

  const loadDefaultValues = async () => {
    setLoadingRoutes(true)
    try {
      const response = await api.get(`/tunnels/${tunnel.id}/routes`)
      if (response.data.success) {
        if (connectionType === 'winrm') {
          if (response.data.default_hostname) {
            setFormData(prev => ({ ...prev, hostname: response.data.default_hostname }))
          }
          if (response.data.winrm_username) {
            setFormData(prev => ({ ...prev, username: response.data.winrm_username }))
          }
          if (response.data.winrm_password) {
            setFormData(prev => ({ ...prev, password: response.data.winrm_password }))
          }
        } else if (connectionType === 'ssh') {
          if (response.data.ssh_hostname) {
            setFormData(prev => ({ ...prev, hostname: response.data.ssh_hostname }))
          }
          if (response.data.ssh_username) {
            setFormData(prev => ({ ...prev, username: response.data.ssh_username }))
          }
        }
      }
    } catch (err) {
      console.error('Error loading default values:', err)
    } finally {
      setLoadingRoutes(false)
    }
  }

  // Helper function to check if evil-winrm is installed
  const checkEvilWinrmInstalled = async () => {
    try {
      const depsResponse = await api.get('/settings/dependencies')
      if (depsResponse.data.success && depsResponse.data.dependencies) {
        const evilwinrmDep = depsResponse.data.dependencies.find(
          dep => dep.name === 'evil-winrm'
        )
        if (evilwinrmDep && !evilwinrmDep.installed) {
          return {
            installed: false,
            error: evilwinrmDep.error || 'evil-winrm is not installed',
            installCommand: evilwinrmDep.install_command || 'gem install evil-winrm'
          }
        }
        return { installed: true }
      }
      return { installed: false, error: 'Failed to check dependencies' }
    } catch (err) {
      console.error('Error checking evil-winrm installation:', err)
      return { installed: false, error: 'Failed to check if evil-winrm is installed' }
    }
  }

  const testConnection = async () => {
    if (!isFormValid) return
    
    // Check if connection is already active
    if (connectionType === 'winrm' && isWinRMConnected) {
      return
    }
    if (connectionType === 'ssh' && isSSHConnected) {
      return
    }

    setLoading(true)
    setError(null)
    setConnectionResult(null)

    try {
      let response
      
      // For NTLM hash, require evil-winrm to be enabled
      if (connectionType === 'winrm' && winrmAuthMethod === 'ntlm' && formData.ntlmHash && formData.username) {
        if (!useEvilWinrm) {
          setError('For NTLM hash authentication, please enable "Use evil-winrm" checkbox')
          setLoading(false)
          return
        }
        
        // Check if evil-winrm is installed
        const evilwinrmCheck = await checkEvilWinrmInstalled()
        if (!evilwinrmCheck.installed) {
          setError(`evil-winrm is not installed. ${evilwinrmCheck.error || ''} Please install it first: ${evilwinrmCheck.installCommand || 'gem install evil-winrm'}`)
          setLoading(false)
          return
        }
        
        // For NTLM hash with evil-winrm, skip test connection and go directly to Module Control Panel
        // Get username and hash from form inputs
        const username = formData.username.trim()
        let ntlmHash = formData.ntlmHash.trim()
        
        // Clean hash: remove colons, dashes, and spaces
        ntlmHash = ntlmHash.replace(/[:-]/g, '').replace(/\s/g, '')
        
        // Validate inputs
        if (!username) {
          setError('Username is required')
          setLoading(false)
          return
        }
        
        if (!ntlmHash) {
          setError('NTLM Hash is required')
          setLoading(false)
          return
        }
        
        // Validate hash length (should be 32 or 64 characters after cleaning)
        if (ntlmHash.length !== 32 && ntlmHash.length !== 64) {
          setError(`Invalid NTLM hash length: ${ntlmHash.length}. Must be 32 or 64 characters.`)
          setLoading(false)
          return
        }
        
        // Check if Route Proxy for WinRM is running
        try {
          const routesResponse = await api.get(`/commands/route-proxies/${tunnel.id}`)
          
          if (!routesResponse.data.success || !routesResponse.data.proxies) {
            setError('Failed to get route proxy information. Please check your connection.')
            setLoading(false)
            return
          }
          
          // Find WinRM proxy (target_port 5986) that is running
          const winrmProxy = routesResponse.data.proxies.find(
            (p) => p.target_port === 5986 && p.is_running === true
          )
          
          if (!winrmProxy || !winrmProxy.local_port) {
            setError('Route proxy for WinRM (port 5986) is not running. Please start it manually from Route Proxies section first.')
            setLoading(false)
            return
          }
          
          const port = winrmProxy.local_port
          
          // Build evil-winrm command
          const evilWinrmCommand = `$(ruby -e 'print Gem.bindir')/evil-winrm -i localhost -u ${username} -H ${ntlmHash} --ssl -P ${port}`
          
          // Update WinRM status to working with evil-winrm command
          dispatch(updateWinRMStatusFromResponse({ 
            tunnelId: tunnel.id, 
            responseData: { 
              winrm_status: 'working',
              cloudflare_port: port,
              message: 'Connected via NTLM hash',
              evilWinrmCommand: evilWinrmCommand
            } 
          }))
          
          // Open Module Control Panel with command
          dispatch(openModal({ tunnelId: tunnel.id, command: evilWinrmCommand }))
          
          // Close Connect modal
          onClose()
          
          setLoading(false)
          return
        } catch (err) {
          console.error('Error getting route proxy port:', err)
          setError('Failed to get route proxy information: ' + (err.response?.data?.detail || err.message))
          setLoading(false)
          return
        }
      }
      
      // For evil-winrm with password, skip test connection and go directly to Module Control Panel
      if (connectionType === 'winrm' && winrmAuthMethod === 'password' && useEvilWinrm && formData.password && formData.username) {
        // Check if evil-winrm is installed
        const evilwinrmCheck = await checkEvilWinrmInstalled()
        if (!evilwinrmCheck.installed) {
          setError(`evil-winrm is not installed. ${evilwinrmCheck.error || ''} Please install it first: ${evilwinrmCheck.installCommand || 'gem install evil-winrm'}`)
          setLoading(false)
          return
        }
        
        // Get username and password from form inputs
        const username = formData.username.trim()
        const password = formData.password.trim()
        
        // Validate inputs
        if (!username) {
          setError('Username is required')
          setLoading(false)
          return
        }
        
        if (!password) {
          setError('Password is required')
          setLoading(false)
          return
        }
        
        // Check if Route Proxy for WinRM is running
        try {
          const routesResponse = await api.get(`/commands/route-proxies/${tunnel.id}`)
          
          if (!routesResponse.data.success || !routesResponse.data.proxies) {
            setError('Failed to get route proxy information. Please check your connection.')
            setLoading(false)
            return
          }
          
          // Find WinRM proxy (target_port 5986) that is running
          const winrmProxy = routesResponse.data.proxies.find(
            (p) => p.target_port === 5986 && p.is_running === true
          )
          
          if (!winrmProxy || !winrmProxy.local_port) {
            setError('Route proxy for WinRM (port 5986) is not running. Please start it manually from Route Proxies section first.')
            setLoading(false)
            return
          }
          
          const port = winrmProxy.local_port
          
          // Build evil-winrm command with -p (password) instead of -H (hash)
          const evilWinrmCommand = `$(ruby -e 'print Gem.bindir')/evil-winrm -i localhost -u ${username} -p ${password} --ssl -P ${port}`
          
          // Update WinRM status to working with evil-winrm command
          dispatch(updateWinRMStatusFromResponse({ 
            tunnelId: tunnel.id, 
            responseData: { 
              winrm_status: 'working',
              cloudflare_port: port,
              message: 'Connected via evil-winrm with password',
              evilWinrmCommand: evilWinrmCommand
            } 
          }))
          
          // Open Module Control Panel with command
          dispatch(openModal({ tunnelId: tunnel.id, command: evilWinrmCommand }))
          
          // Close Connect modal
          onClose()
          
          setLoading(false)
          return
        } catch (err) {
          console.error('Error getting route proxy port:', err)
          setError('Failed to get route proxy information: ' + (err.response?.data?.detail || err.message))
          setLoading(false)
          return
        }
      }
      
      if (connectionType === 'winrm') {
        response = await api.post(`/commands/test-winrm/${tunnel.id}`, {
          hostname: formData.hostname,
          username: formData.username,
          password: formData.password
        })
      } else {
        response = await api.post(`/commands/test-ssh/${tunnel.id}`, {
          hostname: formData.hostname,
          username: formData.username
        })
      }

      if (response.data.success) {
        setConnectionResult({
          success: true,
          message: response.data.message || 'Connection successful!',
          details: response.data.output || response.data.details
        })
        setStep(3)
        
        // Update UI status from POST response - this will immediately update Actions in UI
        if (connectionType === 'winrm') {
          dispatch(updateWinRMStatusFromResponse({ tunnelId: tunnel.id, responseData: response.data }))
          
          // Note: NTLM hash connection is handled in testConnection function
          // This section is for password/certificate authentication only
        } else {
          dispatch(updateSSHStatusFromResponse({ tunnelId: tunnel.id, responseData: response.data }))
        }
      } else {
        setConnectionResult({
          success: false,
          message: response.data.message || 'Connection failed',
          details: response.data.error || response.data.details
        })
        setStep(3)
      }
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error occurred'
      setConnectionResult({
        success: false,
        message: 'Connection failed',
        details: errorMessage
      })
      setStep(3)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const resetModal = () => {
    setStep(1)
    setConnectionType(null)
    setFormData({
      hostname: '',
      username: '',
      password: '',
      ntlmHash: ''
    })
    setWinrmAuthMethod('password')
    setSshAuthMethod('publickey')
    setError(null)
    setConnectionResult(null)
    setLoadingRoutes(false)
  }

  const closeModal = () => {
    resetModal()
    onClose()
  }

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!tunnel) return null

  const modalContent = (
    <div 
      className={`fixed z-[1100] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto ${hideConnectModal ? 'hidden' : ''}`}
      style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
    >
      <div 
        className="rounded-2xl w-full max-w-[600px] overflow-hidden shadow-2xl flex flex-col"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: `1px solid ${isLightMode ? 'var(--border-color)' : 'var(--accent-primary)'}`,
          maxHeight: '90vh'
        }}
      >
        {/* Header */}
        <div 
          className="p-4 flex justify-between items-center flex-shrink-0"
          style={{
            background: isLightMode 
              ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))' 
              : 'linear-gradient(to right, #667eea, #764ba2)',
            color: 'white'
          }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{ backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.2)', color: 'white' }}
            >
              <i className="fas fa-plug"></i>
            </div>
            <div>
              <h3 className="text-xl font-bold m-0" style={{ color: 'white' }}>Connect to Tunnel</h3>
              <p className="text-sm m-0" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{tunnel.name || tunnel.id}</p>
            </div>
          </div>
          <button 
            onClick={closeModal}
            className="w-8 h-8 rounded-lg transition-colors flex items-center justify-center"
            style={{
              backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
              color: 'white'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLightMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.25)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isLightMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)'
            }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          {/* Step 1: Select Connection Type */}
          {step === 1 && (
            <div className="animate-fadeIn">
              <h4 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Select Connection Type</h4>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Choose how you want to connect to this tunnel</p>
              
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => selectConnectionType('winrm')}
                  disabled={isWinRMConnected}
                  className="p-3 border-2 rounded-lg text-center transition-all"
                  style={{
                    backgroundColor: connectionType === 'winrm' 
                      ? (isLightMode ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)')
                      : 'var(--bg-quaternary)',
                    borderColor: connectionType === 'winrm' 
                      ? 'var(--accent-primary)' 
                      : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'),
                    opacity: isWinRMConnected ? 0.5 : 1,
                    cursor: isWinRMConnected ? 'not-allowed' : 'pointer',
                    boxShadow: connectionType === 'winrm' ? '0 0 0 3px rgba(102, 126, 234, 0.2)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isWinRMConnected && connectionType !== 'winrm') {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)'
                      e.currentTarget.style.transform = 'translateY(-4px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (connectionType !== 'winrm') {
                      e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }
                  }}
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg mx-auto mb-1.5"
                    style={{
                      background: isLightMode 
                        ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    }}
                  >
                    <i className="fab fa-windows"></i>
                  </div>
                  <h5 className="font-semibold mb-0.5 text-sm" style={{ color: 'var(--text-primary)' }}>WinRM</h5>
                  <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>
                    {isWinRMConnected ? (
                      <span className="font-semibold" style={{ color: 'var(--success)' }}>✓ Already Connected</span>
                    ) : (
                      'Windows Remote Management'
                    )}
                  </p>
                </button>
                
                <button
                  onClick={() => selectConnectionType('ssh')}
                  disabled={isSSHConnected}
                  className="p-3 border-2 rounded-lg text-center transition-all"
                  style={{
                    backgroundColor: connectionType === 'ssh' 
                      ? (isLightMode ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)')
                      : 'var(--bg-quaternary)',
                    borderColor: connectionType === 'ssh' 
                      ? 'var(--accent-primary)' 
                      : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'),
                    opacity: isSSHConnected ? 0.5 : 1,
                    cursor: isSSHConnected ? 'not-allowed' : 'pointer',
                    boxShadow: connectionType === 'ssh' ? '0 0 0 3px rgba(102, 126, 234, 0.2)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSSHConnected && connectionType !== 'ssh') {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)'
                      e.currentTarget.style.transform = 'translateY(-4px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (connectionType !== 'ssh') {
                      e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }
                  }}
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg mx-auto mb-1.5"
                    style={{
                      background: 'linear-gradient(135deg, var(--success) 0%, #20c997 100%)'
                    }}
                  >
                    <i className="fas fa-terminal"></i>
                  </div>
                  <h5 className="font-semibold mb-0.5 text-sm" style={{ color: 'var(--text-primary)' }}>SSH</h5>
                  <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>
                    {isSSHConnected ? (
                      <span className="font-semibold" style={{ color: 'var(--success)' }}>✓ Already Connected</span>
                    ) : (
                      'Secure Shell'
                    )}
                  </p>
                </button>
                
                <button
                  disabled
                  className="p-3 border-2 rounded-lg text-center opacity-50 cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--bg-quaternary)',
                    borderColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                  }}
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg mx-auto mb-1.5"
                    style={{
                      background: 'linear-gradient(135deg, var(--info) 0%, #138496 100%)'
                    }}
                  >
                    <i className="fas fa-globe"></i>
                  </div>
                  <h5 className="font-semibold mb-0.5 text-sm" style={{ color: 'var(--text-primary)' }}>DNS</h5>
                  <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>Coming Soon</p>
                </button>
                
                <button
                  disabled
                  className="p-3 border-2 rounded-lg text-center opacity-50 cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--bg-quaternary)',
                    borderColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                  }}
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg mx-auto mb-1.5"
                    style={{
                      background: 'linear-gradient(135deg, var(--warning) 0%, #ff9800 100%)'
                    }}
                  >
                    <i className="fas fa-server"></i>
                  </div>
                  <h5 className="font-semibold mb-0.5 text-sm" style={{ color: 'var(--text-primary)' }}>HTTP</h5>
                  <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>Coming Soon</p>
                </button>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg transition-colors"
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
                  onClick={goToStep2}
                  disabled={!connectionType}
                  className="px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2"
                  style={{
                    backgroundColor: !connectionType
                      ? (isLightMode ? '#6c757d' : '#4e5560')
                      : 'var(--accent-primary)',
                    color: !connectionType ? 'var(--text-secondary)' : '#ffffff',
                    cursor: !connectionType ? 'not-allowed' : 'pointer',
                    opacity: !connectionType ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (connectionType) {
                      e.currentTarget.style.backgroundColor = isLightMode ? 'var(--accent-secondary)' : '#5568d3'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (connectionType) {
                      e.currentTarget.style.backgroundColor = 'var(--accent-primary)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  Next
                  <i className="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connection Details */}
          {step === 2 && (
            <div className="animate-fadeIn relative">
              {loadingRoutes && (
                <div className="absolute inset-0 flex items-center justify-center z-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="text-center" style={{ color: 'var(--accent-primary)' }}>
                    <i className="fas fa-spinner fa-spin text-2xl mb-2 block"></i>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Loading connection details...</p>
                  </div>
                </div>
              )}

              <h4 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Connection Details</h4>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Configure connection parameters</p>

              {/* WinRM Configuration */}
              {connectionType === 'winrm' && (
                <div className="space-y-4 mb-6">
                  {isWinRMConnected ? (
                    <div 
                      className="p-6 border rounded-lg text-center"
                      style={{
                        backgroundColor: isLightMode ? 'rgba(40, 167, 69, 0.08)' : 'rgba(40, 167, 69, 0.15)',
                        borderColor: isLightMode ? 'rgba(40, 167, 69, 0.2)' : 'rgba(40, 167, 69, 0.3)'
                      }}
                    >
                      <div className="text-2xl mb-2" style={{ color: 'var(--success)' }}>
                        <i className="fas fa-check-circle"></i>
                      </div>
                      <h5 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>WinRM Already Connected</h5>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This connection is already active. Please disconnect first to create a new connection.</p>
                    </div>
                  ) : (
                    <>
                      {/* Authentication Method Selection */}
                      <div>
                        <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          <i className="fas fa-key" style={{ color: 'var(--accent-primary)' }}></i>
                          Authentication Method
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => setWinrmAuthMethod('password')}
                            className="p-3 border-2 rounded-lg transition-all flex flex-col items-center gap-2"
                            style={{
                              backgroundColor: winrmAuthMethod === 'password'
                                ? (isLightMode ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)')
                                : 'var(--bg-quaternary)',
                              borderColor: winrmAuthMethod === 'password'
                                ? 'var(--accent-primary)'
                                : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)')
                            }}
                            onMouseEnter={(e) => {
                              if (winrmAuthMethod !== 'password') {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (winrmAuthMethod !== 'password') {
                                e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                              }
                            }}
                          >
                            <i className="fas fa-lock" style={{ color: 'var(--accent-primary)' }}></i>
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>User/Password</span>
                          </button>
                          <button
                            onClick={() => setWinrmAuthMethod('certificate')}
                            disabled
                            className="p-3 border-2 rounded-lg opacity-50 cursor-not-allowed flex flex-col items-center gap-2"
                            style={{
                              backgroundColor: 'var(--bg-quaternary)',
                              borderColor: isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                            }}
                          >
                            <i className="fas fa-certificate" style={{ color: 'var(--accent-primary)' }}></i>
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>Certificate <small>(Coming Soon)</small></span>
                          </button>
                          <button
                            onClick={() => setWinrmAuthMethod('ntlm')}
                            className="p-3 border-2 rounded-lg transition-all flex flex-col items-center gap-2"
                            style={{
                              backgroundColor: winrmAuthMethod === 'ntlm'
                                ? (isLightMode ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)')
                                : 'var(--bg-quaternary)',
                              borderColor: winrmAuthMethod === 'ntlm'
                                ? 'var(--accent-primary)'
                                : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)')
                            }}
                            onMouseEnter={(e) => {
                              if (winrmAuthMethod !== 'ntlm') {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (winrmAuthMethod !== 'ntlm') {
                                e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                              }
                            }}
                          >
                            <i className="fas fa-hashtag" style={{ color: 'var(--accent-primary)' }}></i>
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>NTLM Hash</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          <i className="fas fa-globe" style={{ color: 'var(--accent-primary)' }}></i>
                          Hostname
                        </label>
                        <input
                          value={formData.hostname}
                          onChange={(e) => updateFormData('hostname', e.target.value)}
                          type="text"
                          className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="e.g., tunnel.example.com"
                          disabled={loading || loadingRoutes}
                        />
                      </div>

                      {winrmAuthMethod === 'password' && (
                        <>
                          <div>
                            <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                              <i className="fas fa-user" style={{ color: 'var(--accent-primary)' }}></i>
                              Username
                            </label>
                            <input
                              value={formData.username}
                              onChange={(e) => updateFormData('username', e.target.value)}
                              type="text"
                              className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                              style={{
                                backgroundColor: 'var(--bg-secondary)',
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-primary)'
                              }}
                              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                              placeholder="e.g., WinRMUser"
                              disabled={loading || loadingRoutes}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                              <i className="fas fa-lock" style={{ color: 'var(--accent-primary)' }}></i>
                              Password
                            </label>
                            <input
                              value={formData.password}
                              onChange={(e) => updateFormData('password', e.target.value)}
                              type="password"
                              className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                              style={{
                                backgroundColor: 'var(--bg-secondary)',
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-primary)'
                              }}
                              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                              placeholder="Enter password"
                              disabled={loading || loadingRoutes}
                            />
                          </div>

                          <div 
                            className="mt-3 p-3 rounded-lg border-2 transition-all cursor-pointer"
                            style={{
                              background: useEvilWinrm 
                                ? (isLightMode 
                                    ? 'linear-gradient(to right, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))' 
                                    : 'linear-gradient(to right, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2))')
                                : 'var(--bg-quaternary)',
                              borderColor: useEvilWinrm ? 'var(--accent-primary)' : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'),
                              boxShadow: useEvilWinrm ? '0 4px 12px rgba(102, 126, 234, 0.2)' : 'none'
                            }}
                            onClick={() => !loading && !loadingRoutes && setUseEvilWinrm(!useEvilWinrm)}
                            onMouseEnter={(e) => {
                              if (!useEvilWinrm) {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!useEvilWinrm) {
                                e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  id="useEvilWinrm"
                                  checked={useEvilWinrm}
                                  onChange={(e) => setUseEvilWinrm(e.target.checked)}
                                  className="w-5 h-5 rounded border-2 cursor-pointer"
                                  style={{
                                    accentColor: 'var(--accent-primary)',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--accent-primary)'
                                  }}
                                  disabled={loading || loadingRoutes}
                                />
                              </div>
                              <div className="flex items-center gap-2 flex-1">
                                <i className="fas fa-terminal text-sm" style={{ color: useEvilWinrm ? 'var(--accent-primary)' : 'var(--text-secondary)' }}></i>
                                <label htmlFor="useEvilWinrm" className="text-sm font-semibold cursor-pointer select-none" style={{ color: useEvilWinrm ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                                  Use evil-winrm
                                </label>
                              </div>
                              {useEvilWinrm && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.15)' : 'rgba(102, 126, 234, 0.2)', color: 'var(--accent-primary)' }}>
                                  <i className="fas fa-check-circle"></i>
                                  <span>Active</span>
                                </div>
                              )}
                            </div>
                            {useEvilWinrm && (
                              <p className="text-xs mt-2 ml-8" style={{ color: 'var(--text-secondary)' }}>
                                Interactive shell will be available in Module Control Panel
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      {winrmAuthMethod === 'ntlm' && (
                        <>
                          <div>
                            <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                              <i className="fas fa-user" style={{ color: 'var(--accent-primary)' }}></i>
                              Username
                            </label>
                            <input
                              value={formData.username}
                              onChange={(e) => updateFormData('username', e.target.value)}
                              type="text"
                              className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                              style={{
                                backgroundColor: 'var(--bg-secondary)',
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-primary)'
                              }}
                              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                              placeholder="e.g., Administrator"
                              disabled={loading || loadingRoutes}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                              <i className="fas fa-hashtag" style={{ color: 'var(--accent-primary)' }}></i>
                              NTLM Hash
                            </label>
                            <input
                              value={formData.ntlmHash}
                              onChange={(e) => updateFormData('ntlmHash', e.target.value)}
                              type="text"
                              className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                              style={{
                                backgroundColor: 'var(--bg-secondary)',
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-primary)'
                              }}
                              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                              placeholder="e.g., aad3b435b51404eeaad3b435b51404ee"
                              disabled={loading || loadingRoutes}
                            />
                            <small className="text-xs mt-1 block" style={{ color: 'var(--text-tertiary)' }}>Enter the NTLM hash (32 or 65 characters)</small>
                          </div>

                          <div 
                            className="mt-3 p-3 rounded-lg border-2 transition-all cursor-pointer"
                            style={{
                              background: useEvilWinrm 
                                ? (isLightMode 
                                    ? 'linear-gradient(to right, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))' 
                                    : 'linear-gradient(to right, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2))')
                                : 'var(--bg-quaternary)',
                              borderColor: useEvilWinrm ? 'var(--accent-primary)' : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'),
                              boxShadow: useEvilWinrm ? '0 4px 12px rgba(102, 126, 234, 0.2)' : 'none'
                            }}
                            onClick={() => !loading && !loadingRoutes && setUseEvilWinrm(!useEvilWinrm)}
                            onMouseEnter={(e) => {
                              if (!useEvilWinrm) {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!useEvilWinrm) {
                                e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  id="useEvilWinrmNtlm"
                                  checked={useEvilWinrm}
                                  onChange={(e) => setUseEvilWinrm(e.target.checked)}
                                  className="w-5 h-5 rounded border-2 cursor-pointer"
                                  style={{
                                    accentColor: 'var(--accent-primary)',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--accent-primary)'
                                  }}
                                  disabled={loading || loadingRoutes}
                                />
                              </div>
                              <div className="flex items-center gap-2 flex-1">
                                <i className="fas fa-terminal text-sm" style={{ color: useEvilWinrm ? 'var(--accent-primary)' : 'var(--text-secondary)' }}></i>
                                <label htmlFor="useEvilWinrmNtlm" className="text-sm font-semibold cursor-pointer select-none" style={{ color: useEvilWinrm ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                                  Use evil-winrm
                                </label>
                              </div>
                              {useEvilWinrm && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.15)' : 'rgba(102, 126, 234, 0.2)', color: 'var(--accent-primary)' }}>
                                  <i className="fas fa-check-circle"></i>
                                  <span>Active</span>
                                </div>
                              )}
                            </div>
                            {useEvilWinrm && (
                              <p className="text-xs mt-2 ml-8" style={{ color: 'var(--text-secondary)' }}>
                                Interactive shell will be available in Module Control Panel
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* SSH Configuration */}
              {connectionType === 'ssh' && (
                <div className="space-y-4 mb-6">
                  {isSSHConnected ? (
                    <div 
                      className="p-6 border rounded-lg text-center"
                      style={{
                        backgroundColor: isLightMode ? 'rgba(40, 167, 69, 0.08)' : 'rgba(40, 167, 69, 0.15)',
                        borderColor: isLightMode ? 'rgba(40, 167, 69, 0.2)' : 'rgba(40, 167, 69, 0.3)'
                      }}
                    >
                      <div className="text-2xl mb-2" style={{ color: 'var(--success)' }}>
                        <i className="fas fa-check-circle"></i>
                      </div>
                      <h5 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>SSH Already Connected</h5>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This connection is already active. Please disconnect first to create a new connection.</p>
                    </div>
                  ) : (
                    <>
                      {/* Authentication Method Selection */}
                      <div>
                        <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          <i className="fas fa-key" style={{ color: 'var(--accent-primary)' }}></i>
                          Authentication Method
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSshAuthMethod('publickey')}
                            className="p-3 border-2 rounded-lg transition-all flex flex-col items-center gap-2"
                            style={{
                              backgroundColor: sshAuthMethod === 'publickey'
                                ? (isLightMode ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)')
                                : 'var(--bg-quaternary)',
                              borderColor: sshAuthMethod === 'publickey'
                                ? 'var(--accent-primary)'
                                : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)')
                            }}
                            onMouseEnter={(e) => {
                              if (sshAuthMethod !== 'publickey') {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (sshAuthMethod !== 'publickey') {
                                e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                              }
                            }}
                          >
                            <i className="fas fa-key" style={{ color: 'var(--accent-primary)' }}></i>
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>Public Key</span>
                          </button>
                          <button
                            onClick={() => setSshAuthMethod('password')}
                            className="p-3 border-2 rounded-lg transition-all flex flex-col items-center gap-2"
                            style={{
                              backgroundColor: sshAuthMethod === 'password'
                                ? (isLightMode ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.15)')
                                : 'var(--bg-quaternary)',
                              borderColor: sshAuthMethod === 'password'
                                ? 'var(--accent-primary)'
                                : (isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)')
                            }}
                            onMouseEnter={(e) => {
                              if (sshAuthMethod !== 'password') {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (sshAuthMethod !== 'password') {
                                e.currentTarget.style.borderColor = isLightMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.3)'
                              }
                            }}
                          >
                            <i className="fas fa-lock" style={{ color: 'var(--accent-primary)' }}></i>
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>Username/Password</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          <i className="fas fa-globe" style={{ color: 'var(--accent-primary)' }}></i>
                          Hostname
                        </label>
                        <input
                          value={formData.hostname}
                          onChange={(e) => updateFormData('hostname', e.target.value)}
                          type="text"
                          className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="e.g., tunnel.example.com"
                          disabled={loading || loadingRoutes}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          <i className="fas fa-user" style={{ color: 'var(--accent-primary)' }}></i>
                          Username
                        </label>
                        <input
                          value={formData.username}
                          onChange={(e) => updateFormData('username', e.target.value)}
                          type="text"
                          className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                          placeholder="e.g., root"
                          disabled={loading || loadingRoutes}
                        />
                      </div>

                      {sshAuthMethod === 'publickey' && (
                        <div 
                          className="p-3 border-l-4 rounded flex items-start gap-2 text-sm"
                          style={{
                            backgroundColor: isLightMode ? 'rgba(102, 126, 234, 0.08)' : 'rgba(102, 126, 234, 0.1)',
                            borderLeftColor: 'var(--accent-primary)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          <i className="fas fa-info-circle mt-0.5" style={{ color: 'var(--accent-primary)' }}></i>
                          <span>SSH private key will be automatically used from <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>/root/.ssh/id_ed25519</code></span>
                        </div>
                      )}

                      {sshAuthMethod === 'password' && (
                        <div>
                          <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <i className="fas fa-lock" style={{ color: 'var(--accent-primary)' }}></i>
                            Password
                          </label>
                          <input
                            value={formData.password}
                            onChange={(e) => updateFormData('password', e.target.value)}
                            type="password"
                            className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                            style={{
                              backgroundColor: 'var(--bg-secondary)',
                              borderColor: 'var(--border-color)',
                              color: 'var(--text-primary)'
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                            placeholder="Enter SSH password"
                            disabled={loading || loadingRoutes}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {error && (
                <div 
                  className="flex items-center gap-2 p-4 border rounded-lg mb-4"
                  style={{
                    backgroundColor: isLightMode ? 'rgba(220, 53, 69, 0.08)' : 'rgba(220, 53, 69, 0.15)',
                    borderColor: isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)',
                    color: 'var(--danger)'
                  }}
                >
                  <i className="fas fa-exclamation-circle"></i>
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setStep(1)}
                  disabled={loading || loadingRoutes}
                  className="px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: isLightMode ? '#6c757d' : '#4e5560',
                    color: '#ffffff'
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !loadingRoutes) {
                      e.currentTarget.style.backgroundColor = isLightMode ? '#5a6268' : '#3d4248'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isLightMode ? '#6c757d' : '#4e5560'
                  }}
                >
                  <i className="fas fa-arrow-left mr-2"></i>
                  Back
                </button>
                <button
                  onClick={testConnection}
                  disabled={loading || loadingRoutes || !isFormValid || isAlreadyConnected}
                  className="px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2"
                  style={{
                    backgroundColor: loading || loadingRoutes || !isFormValid || isAlreadyConnected
                      ? (isLightMode ? '#6c757d' : '#4e5560')
                      : 'var(--success)',
                    color: loading || loadingRoutes || !isFormValid || isAlreadyConnected ? 'var(--text-secondary)' : '#ffffff',
                    cursor: loading || loadingRoutes || !isFormValid || isAlreadyConnected ? 'not-allowed' : 'pointer',
                    opacity: loading || loadingRoutes || !isFormValid || isAlreadyConnected ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !loadingRoutes && isFormValid && !isAlreadyConnected) {
                      e.currentTarget.style.backgroundColor = isLightMode ? '#218838' : '#20c997'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && !loadingRoutes && isFormValid && !isAlreadyConnected) {
                      e.currentTarget.style.backgroundColor = 'var(--success)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  {loading || loadingRoutes ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-plug"></i>
                      Connect
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Connection Result */}
          {step === 3 && (
            <div className="animate-fadeIn">
              {connectionResult?.success ? (
                <div 
                  className="p-6 border rounded-lg text-center mb-6"
                  style={{
                    backgroundColor: isLightMode ? 'rgba(40, 167, 69, 0.08)' : 'rgba(40, 167, 69, 0.15)',
                    borderColor: isLightMode ? 'rgba(40, 167, 69, 0.2)' : 'rgba(40, 167, 69, 0.3)'
                  }}
                >
                  <div className="text-3xl mb-2" style={{ color: 'var(--success)' }}>
                    <i className="fas fa-check-circle"></i>
                  </div>
                  <h4 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Connection Successful!</h4>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{connectionResult.message}</p>
                  {connectionResult.details && (
                    <div className="rounded-lg p-4 text-left mt-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <pre className="text-xs whitespace-pre-wrap break-words m-0" style={{ color: 'var(--text-primary)' }}>{connectionResult.details}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  className="p-6 border rounded-lg text-center mb-6"
                  style={{
                    backgroundColor: isLightMode ? 'rgba(220, 53, 69, 0.08)' : 'rgba(220, 53, 69, 0.15)',
                    borderColor: isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)'
                  }}
                >
                  <div className="text-3xl mb-2" style={{ color: 'var(--danger)' }}>
                    <i className="fas fa-times-circle"></i>
                  </div>
                  <h4 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Connection Failed</h4>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{connectionResult?.message}</p>
                  {connectionResult?.details && (
                    <div className="rounded-lg p-4 text-left mt-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <pre className="text-xs whitespace-pre-wrap break-words m-0" style={{ color: 'var(--text-primary)' }}>{connectionResult.details}</pre>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                {!connectionResult?.success && (
                  <button
                    onClick={resetModal}
                    className="px-4 py-2 rounded-lg transition-colors"
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
                    Try Again
                  </button>
                )}
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg transition-all"
                  style={{
                    background: isLightMode 
                      ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))'
                      : 'linear-gradient(to right, #667eea, #764ba2)',
                    color: '#ffffff'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {createPortal(modalContent, document.body)}
      {showTerminalModal && (
        <TerminalModal
          command={terminalCommand}
          title={terminalTitle}
          onClose={() => {
            setShowTerminalModal(false)
            setTerminalCommand(null)
            setTerminalTitle('Terminal')
            setHideConnectModal(false)
            // Close Connect modal after TerminalModal closes
            onClose()
          }}
        />
      )}
    </>
  )
}

export default ConnectModal

