import { useState, useEffect, useMemo, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { createPortal } from 'react-dom'
import api from '../../utils/api'
import { closeModal, appendOutput, clearOutput, appendShellOutput, clearShellOutput, setShellInput } from '../../store/slices/modulesSlice'
import { loadRoutes } from '../../store/slices/routesSlice'
import { alertError, alertSuccess } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'
import TerminalModal from './TerminalModal'

const ModuleModalDynamic = () => {
  const dispatch = useDispatch()
  const modules = useSelector(state => state.modules)
  const { isModalOpen, currentTunnelId, commandOutput, shellOutput, shellInput, initialCommand } = modules
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'

  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [sections, setSections] = useState([])
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [moduleExecutionType, setModuleExecutionType] = useState('powershell')
  const [externalCommand, setExternalCommand] = useState(null)
  
  // Debug: Log commandOutput changes
  useEffect(() => {
    console.log('commandOutput changed:', commandOutput)
  }, [commandOutput])
  const [shellType, setShellType] = useState('cmd') // 'cmd' or 'powershell'
  const [shellExecuting, setShellExecuting] = useState(false)
  
  // ttyd state
  const [ttydLoading, setTtydLoading] = useState(false)
  const [ttydStatus, setTtydStatus] = useState(null)
  const [ttydError, setTtydError] = useState(null)
  const [ttydVisible, setTtydVisible] = useState(false)
  const [ttydListenPort, setTtydListenPort] = useState(8080)
  const [ttydUsername, setTtydUsername] = useState('a')
  const [ttydPassword, setTtydPassword] = useState('a')
  const [ttydSshUser, setTtydSshUser] = useState('cltwo')
  const [ttydSshHost, setTtydSshHost] = useState('localhost')
  const [ttydSshPort, setTtydSshPort] = useState(2222)
  const [ttydWritable, setTtydWritable] = useState(true)
  const [ttydSharedSession, setTtydSharedSession] = useState(false)
  
  const shellInputRef = useRef(null)
  const shellOutputRef = useRef(null)

  const tunnelsState = useSelector(state => state.tunnels)
  const routesState = useSelector(state => state.routes)
  
  // Get evil-winrm command from winrmStatus if initialCommand is not provided
  const evilWinrmCommand = useMemo(() => {
    if (initialCommand) {
      return initialCommand
    }
    if (currentTunnelId && tunnelsState.winrmStatus[currentTunnelId]?.evilWinrmCommand) {
      return tunnelsState.winrmStatus[currentTunnelId].evilWinrmCommand
    }
    return null
  }, [initialCommand, currentTunnelId, tunnelsState.winrmStatus])

  // Memoize evilwinrm auth method detection
  const evilWinrmAuthMethod = useMemo(() => {
    if (!evilWinrmCommand) return ''
    if (evilWinrmCommand.includes(' -H ')) {
      return 'NTLM Hash'
    } else if (evilWinrmCommand.includes(' -p ')) {
      return 'Password'
    }
    return 'evil-winrm'
  }, [evilWinrmCommand])
  
  // State for connection info
  const [connectionInfo, setConnectionInfo] = useState(null)
  
  // Get current tunnel info for connection display
  useEffect(() => {
    if (!currentTunnelId) {
      setConnectionInfo(null)
      return
    }
    
    let isCancelled = false
    
    const loadConnectionInfo = async () => {
      try {
        // Try to get from routesState first (if loaded for this tunnel)
        const tunnel = tunnelsState.tunnels.find(t => t.id === currentTunnelId)
        if (!tunnel) {
          setConnectionInfo(null)
          return
        }
        
        // First, try to get connection_type from routes API to get the most up-to-date info
        let connectionType = null
        let routesData = null
        
        try {
          const routesResponse = await api.get(`/tunnels/${currentTunnelId}/routes`)
          if (routesResponse.data.success) {
            routesData = routesResponse.data
            // Determine connection type from ingress routes if not explicitly set
            const ingress = routesResponse.data.ingress || []
            let hasWinRM = false
            let hasSSH = false
            
            for (const route of ingress) {
              const service = (route.service || '').toLowerCase().trim()
              // Check for WinRM (TCP port 5986)
              if (service.startsWith('tcp://') && service.includes(':5986')) {
                hasWinRM = true
              }
              // Check for SSH (ssh:// or TCP port 22)
              if (service.startsWith('ssh://') || (service.startsWith('tcp://') && service.includes(':22'))) {
                hasSSH = true
              }
            }
            
            // Priority: WinRM over SSH if both exist (same as backend logic)
            if (hasWinRM) {
              connectionType = 'winrm'
            } else if (hasSSH) {
              connectionType = 'ssh'
            }
          }
        } catch (error) {
          console.error('Error fetching routes for connection type:', error)
        }
        
        // Fallback to tunnel.connection_type if routes API didn't provide it
        if (!connectionType) {
          connectionType = (tunnel.connection_type || 'winrm').toLowerCase()
        } else {
          connectionType = connectionType.toLowerCase()
        }
        
        const isWinRM = connectionType === 'winrm'
        const isSSH = connectionType === 'ssh'
        
        // Check if routesState is for current tunnel
        const routesLoadedForThisTunnel = routesState.currentTunnelId === currentTunnelId
        
        let username = ''
        let hasPassword = false
        
        if (isWinRM) {
          // Check if evilwinrm is being used
          const hasEvilWinrm = evilWinrmCommand !== null
          
          // Try routesState first if loaded for this tunnel, otherwise use routesData from above, or fetch from API
          if (routesLoadedForThisTunnel && routesState.winrmUsername) {
            username = routesState.winrmUsername
            hasPassword = !!routesState.winrmPassword
          } else if (routesData) {
            username = routesData.winrm_username || 'N/A'
            hasPassword = !!routesData.winrm_password
          } else {
            // Fetch from API
            const response = await api.get(`/tunnels/${currentTunnelId}/routes`)
            if (!isCancelled && response.data.success) {
              username = response.data.winrm_username || 'N/A'
              hasPassword = !!response.data.winrm_password
            } else if (!isCancelled) {
              username = 'N/A'
              hasPassword = false
            }
          }
          
          // Use memoized auth method
          const authMethod = hasEvilWinrm ? evilWinrmAuthMethod : ''
          
          if (!isCancelled) {
            if (hasEvilWinrm) {
              setConnectionInfo({
                type: 'WinRM',
                info: `WinRM • User: ${username} • evil-winrm • ${authMethod}`
              })
            } else {
              setConnectionInfo({
                type: 'WinRM',
                info: `WinRM • User: ${username} • Password: ${hasPassword ? 'Yes' : 'No'}`
              })
            }
          }
        } else if (isSSH) {
          // Try routesState first if loaded for this tunnel, otherwise use routesData from above, or fetch from API
          if (routesLoadedForThisTunnel && routesState.sshUsername) {
            username = routesState.sshUsername
            hasPassword = !!routesState.sshPassword
          } else if (routesData) {
            username = routesData.ssh_username || ''
            hasPassword = !!routesData.ssh_password
            console.log('SSH connection info from routesData:', { username, hasPassword, routesData })
          } else {
            // Fetch from API
            const response = await api.get(`/tunnels/${currentTunnelId}/routes`)
            if (response.data.success) {
              username = response.data.ssh_username || ''
              hasPassword = !!response.data.ssh_password
              console.log('SSH connection info from API:', { username, hasPassword, responseData: response.data })
            } else {
              username = ''
              hasPassword = false
            }
          }
          
          // If username is empty, try to get from tunnel data as fallback
          if (!username) {
            // SSH username might be stored elsewhere, check tunnel metadata or try to infer
            username = 'N/A'
          }
          
          // Determine authentication type
          const authType = hasPassword ? 'Password' : 'Public Key'
          
          setConnectionInfo({
            type: 'SSH',
            info: `SSH • User: ${username} • Auth: ${authType}`
          })
        } else {
          setConnectionInfo({
            type: connectionType,
            info: `${connectionType}`
          })
        }
      } catch (error) {
        console.error('Error loading connection info:', error)
        // Fallback to tunnel data
        const tunnel = tunnelsState.tunnels.find(t => t.id === currentTunnelId)
        if (tunnel) {
          const connectionType = (tunnel.connection_type || 'winrm').toLowerCase()
          const isWinRM = connectionType === 'winrm'
          const isSSH = connectionType === 'ssh'
          
          if (isWinRM) {
            // Check if evilwinrm is being used
            const hasEvilWinrm = evilWinrmCommand !== null
            const authMethod = hasEvilWinrm ? evilWinrmAuthMethod : ''
            
            if (hasEvilWinrm) {
              setConnectionInfo({
                type: 'WinRM',
                info: `WinRM • User: N/A • evil-winrm • ${authMethod}`
              })
            } else {
              setConnectionInfo({
                type: 'WinRM',
                info: `WinRM • User: N/A • Password: No`
              })
            }
          } else if (isSSH) {
            setConnectionInfo({
              type: 'SSH',
              info: `SSH • User: N/A • Auth: Public Key`
            })
          } else {
            setConnectionInfo({
              type: connectionType,
              info: `${connectionType}`
            })
          }
        }
      }
    }
    
    loadConnectionInfo()
    
    // Cleanup function to cancel pending requests
    return () => {
      isCancelled = true
    }
  }, [currentTunnelId, tunnelsState.tunnels, routesState.currentTunnelId, routesState.winrmUsername, routesState.winrmPassword, routesState.sshUsername, routesState.sshPassword, evilWinrmCommand, evilWinrmAuthMethod])
  
  // Load SSH info for ttyd when tunnel changes
  useEffect(() => {
    if (!currentTunnelId) {
      return
    }
    
    const loadSSHInfoForTTYD = async () => {
      try {
        // Get connection type
        const tunnel = tunnelsState.tunnels.find(t => t.id === currentTunnelId)
        if (!tunnel) {
          return
        }
        
        // Get routes data to determine connection type and get SSH info
        const routesResponse = await api.get(`/tunnels/${currentTunnelId}/routes`)
        if (!routesResponse.data.success) {
          return
        }
        
        const routesData = routesResponse.data
        const ingress = routesData.ingress || []
        
        // Determine connection type
        let connectionType = null
        let hasWinRM = false
        let hasSSH = false
        
        for (const route of ingress) {
          const service = (route.service || '').toLowerCase().trim()
          if (service.startsWith('tcp://') && service.includes(':5986')) {
            hasWinRM = true
          }
          if (service.startsWith('ssh://') || (service.startsWith('tcp://') && service.includes(':22'))) {
            hasSSH = true
          }
        }
        
        if (hasWinRM) {
          connectionType = 'winrm'
        } else if (hasSSH) {
          connectionType = 'ssh'
        } else {
          connectionType = (tunnel.connection_type || 'winrm').toLowerCase()
        }
        
        // Only update ttyd SSH info if connection type is SSH
        if (connectionType === 'ssh') {
          // Get SSH username
          const sshUsername = routesData.ssh_username || ''
          if (sshUsername) {
            setTtydSshUser(sshUsername)
          }
          
          // SSH host is always localhost (route proxy runs locally)
          setTtydSshHost('localhost')
          
          // Get route proxy local port for SSH (this is the port that route proxy listens on locally)
          try {
            // Try to get route proxy info for this tunnel
            const proxyResponse = await api.get(`/commands/route-proxies/${currentTunnelId}`)
            if (proxyResponse.data.success && proxyResponse.data.proxies) {
              // Find SSH proxy (target_port = 22) that is running
              const sshProxy = proxyResponse.data.proxies.find(p => 
                p.target_port === 22 && p.is_running === true
              )
              
              if (sshProxy && sshProxy.local_port) {
                setTtydSshPort(sshProxy.local_port)
                console.log('Found SSH route proxy:', sshProxy)
              } else {
                console.warn('No running SSH route proxy found for tunnel', currentTunnelId)
              }
            }
          } catch (proxyError) {
            console.error('Error getting route proxy port:', proxyError)
            // Keep default port 2222
          }
        }
      } catch (error) {
        console.error('Error loading SSH info for ttyd:', error)
      }
    }
    
    loadSSHInfoForTTYD()
  }, [currentTunnelId, tunnelsState.tunnels])
  
  const currentTunnelInfo = connectionInfo

  const specialCategoryIds = ['cat-remote', 'cat-shell', 'cat-ttyd']

  const regularCategories = useMemo(() => {
    return categories.filter(cat => !specialCategoryIds.includes(cat.id))
  }, [categories])

  useEffect(() => {
    if (isModalOpen && categories.length === 0) {
      loadModuleStructure()
    } else if (isModalOpen && categories.length > 0) {
      // Set default category as active
      const defaultCategory = categories.find(
        cat => (cat.is_default === 1 || cat.is_default === true) && (cat.is_active === 1 || cat.is_active === true)
      )
      if (defaultCategory) {
        setActiveCategory(defaultCategory.id)
      } else if (categories.length > 0) {
        setActiveCategory(categories[0].id)
      }
    }
  }, [isModalOpen, categories.length])

  // Load routes when modal opens to get connection info
  useEffect(() => {
    if (isModalOpen && currentTunnelId) {
      dispatch(loadRoutes(currentTunnelId))
    }
  }, [isModalOpen, currentTunnelId, dispatch])

  const loadModuleStructure = async () => {
    setLoading(true)
    try {
      const response = await api.get('/module-control/structure')
      if (response.data.success) {
        const structure = response.data.structure
        setCategories(structure)
        
        // Flatten sections and items
        const allSections = []
        const allItems = []
        
        structure.forEach(cat => {
          if (cat.sections) {
            allSections.push(...cat.sections)
            cat.sections.forEach(sec => {
              if (sec.items) {
                allItems.push(...sec.items)
              }
            })
          }
        })
        
        setSections(allSections)
        setItems(allItems)
        
        // Set default category as active
        const defaultCategory = structure.find(
          cat => (cat.is_default === 1 || cat.is_default === true) && (cat.is_active === 1 || cat.is_active === true)
        )
        if (defaultCategory) {
          setActiveCategory(defaultCategory.id)
        } else if (structure.length > 0) {
          setActiveCategory(structure[0].id)
        }
      }
    } catch (error) {
      console.error('Error loading module structure:', error)
      alertError('Failed to load module structure', 'Error')
    } finally {
      setLoading(false)
    }
  }

  const getSectionsByCategory = (categoryId) => {
    return sections.filter(s => s.category_id === categoryId && s.is_active)
  }

  const getItemsBySection = (sectionId) => {
    return items.filter(i => i.section_id === sectionId && i.is_active)
  }

  const executeModuleItem = async (item) => {
    if (!currentTunnelId) {
      alertError('Please select a tunnel first', 'No Tunnel Selected')
      return
    }
    
    // If evilwinrm is active, send command directly to TerminalModal
    if (evilWinrmCommand) {
      // Determine execution type and build command
      const executionType = item.execution_type || moduleExecutionType
      let commandToExecute = item.command
      
      // Since evilwinrm runs in PowerShell context, handle execution types:
      // - PowerShell commands: execute directly
      // - CMD commands: wrap with cmd /c
      if (executionType === 'cmd') {
        // Escape double quotes for PowerShell (use backtick)
        const escapedCommand = commandToExecute.replace(/"/g, '`"')
        commandToExecute = `cmd /c "${escapedCommand}"`
      }
      // PowerShell commands are executed directly (no wrapping needed)
      
      // Send command to TerminalModal via externalCommand prop
      // Use a unique value to trigger the useEffect in TerminalModal
      setExternalCommand(`${Date.now()}:${commandToExecute}`)
      return
    }
    
    // Original behavior: execute via API and show in Command Output
    // Clear previous output
    dispatch(clearOutput())
    
    // Add command to output
    dispatch(appendOutput({ text: `[Executing: ${item.label}]`, type: 'command' }))
    dispatch(appendOutput({ text: '─'.repeat(50), type: 'separator' }))
    
    try {
      // Determine execution type
      const executionType = item.execution_type || moduleExecutionType
      
      // Execute command
      const response = await api.post(`/commands/execute/${currentTunnelId}`, {
        command: item.command,
        execution_type: executionType
      })
      
      const result = response.data
      
      console.log('Command execution result:', JSON.stringify(result, null, 2))
      
      // Add output (even if success is false)
      if (result.output && typeof result.output === 'string' && result.output.trim()) {
        dispatch(appendOutput({ text: result.output, type: 'output' }))
      }
      
      // Add error/warning based on exit code
      // Always show error if it exists, regardless of success status
      if (result.error !== null && result.error !== undefined) {
        const errorText = typeof result.error === 'string' ? result.error.trim() : String(result.error).trim()
        console.log('Error text:', errorText, 'Length:', errorText.length)
        if (errorText) {
          if (result.exit_code === 0) {
            // If exit code is 0, treat error as warning/info (might be stderr output)
            dispatch(appendOutput({ text: errorText, type: 'output' }))
          } else {
            // Show as error if exit code is non-zero
            console.log('Dispatching error output:', errorText)
            dispatch(appendOutput({ text: `Error: ${errorText}`, type: 'error' }))
          }
        }
      }
      
      // Add exit code (always show)
      if (result.exit_code !== undefined && result.exit_code !== null) {
        const exitCodeType = result.exit_code === 0 ? 'success' : 'error'
        dispatch(appendOutput({ text: `Exit Code: ${result.exit_code}`, type: exitCodeType }))
      }
      
      console.log('Current commandOutput after dispatch:', commandOutput)
    } catch (error) {
      console.error('Error executing module item:', error)
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error'
      dispatch(appendOutput({ text: `Error: ${errorMessage}`, type: 'error' }))
      alertError(`Failed to execute ${item.label}`, 'Error')
    }
  }

  const getOutputColor = (type) => {
    const isLightMode = document.documentElement.getAttribute('data-theme') === 'light'
    
    const colors = {
      success: '#00ff88',
      error: '#ff4444',
      warning: '#ffaa00',
      command: '#667eea',
      separator: isLightMode ? '#adb5bd' : '#3a3a4e',
      output: isLightMode ? '#1a1a2e' : '#e0e0e0',
      info: isLightMode ? '#6c757d' : '#a0a0a0',
      prompt: '#667eea'
    }
    return colors[type] || (isLightMode ? '#6c757d' : '#a0a0a0')
  }

  // Shell functions
  const executeShellCommand = async () => {
    if (!shellInput.trim()) return

    if (!currentTunnelId) {
      dispatch(appendShellOutput({ text: '❌ Error: No tunnel selected', type: 'error' }))
      return
    }

    const originalCommand = shellInput
    const timestamp = new Date().toLocaleTimeString()

    dispatch(appendShellOutput({ text: `[${timestamp}] $ ${originalCommand}`, type: 'command' }))

    // Use provided shellType, or auto-detect based on command content
    let commandType = shellType
    if (!commandType) {
      const isMultiLine = originalCommand.includes('\n')
      const hasPowerShellSyntax = originalCommand.includes('$') ||
        originalCommand.includes('#') ||
        originalCommand.includes('Get-') ||
        originalCommand.includes('Write-') ||
        originalCommand.includes('powershell') ||
        originalCommand.includes('ps')

      commandType = isMultiLine || hasPowerShellSyntax ? 'powershell' : 'cmd'
    }
    
    const endpoint = commandType === 'powershell'
      ? `/commands/execute-ps-by-tunnel/${currentTunnelId}`
      : `/commands/execute-by-tunnel/${currentTunnelId}`

    dispatch(setShellInput(''))
    setShellExecuting(true)

    try {
      const response = await api.post(endpoint, { command: originalCommand })

      // Check if command was successful or has output
      const hasOutput = response.data.output && response.data.output.trim()
      const hasError = response.data.error && response.data.error.trim()
      const isSuccess = response.data.success || (hasOutput && !hasError)
      
      if (isSuccess || hasOutput) {
        if (response.data.output) {
          dispatch(appendShellOutput({ text: response.data.output, type: 'output' }))
        }
        if (response.data.exit_code !== undefined && response.data.exit_code !== 0) {
          dispatch(appendShellOutput({ text: `Exit Code: ${response.data.exit_code}`, type: 'warning' }))
        }
        if (response.data.error && response.data.error.trim()) {
          dispatch(appendShellOutput({ text: `⚠ Warning: ${response.data.error}`, type: 'warning' }))
        }
      } else {
        dispatch(appendShellOutput({ text: `❌ Error: ${response.data.error || response.data.detail || 'Command execution failed'}`, type: 'error' }))
      }
    } catch (err) {
      console.error('Error executing shell command:', err)
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error'
      dispatch(appendShellOutput({ text: `❌ Error: ${errorMessage}`, type: 'error' }))
    } finally {
      setShellExecuting(false)
    }

    // Scroll to bottom
    if (shellOutputRef.current) {
      shellOutputRef.current.scrollTop = shellOutputRef.current.scrollHeight
    }
  }

  const handleShellKeyPress = (event) => {
    // Ctrl+Enter or Shift+Enter to execute, Enter alone for new line
    if (event.key === 'Enter' && (event.ctrlKey || event.shiftKey)) {
      event.preventDefault()
      executeShellCommand()
    }
  }

  const autoResizeTextarea = (event) => {
    const textarea = event.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }

  const handleClearShellOutput = () => {
    if (window.confirm('Clear shell output?')) {
      dispatch(clearShellOutput())
    }
  }


  // Check if current tunnel is SSH-based
  const isSSHTunnel = useMemo(() => {
    if (!currentTunnelId) return false
    
    // First, check SSH status - if SSH is working, it's definitely SSH tunnel
    const sshStatus = tunnelsState.sshStatus[currentTunnelId]
    if (sshStatus && sshStatus.status === 'working') {
      return true
    }
    
    // Fallback: check tunnel data
    const tunnel = tunnelsState.tunnels.find(t => t.id === currentTunnelId)
    if (!tunnel) return false
    
    return false // Default to false if can't determine
  }, [currentTunnelId, tunnelsState.sshStatus, tunnelsState.tunnels])

  // ttyd URL
  const ttydUrl = useMemo(() => {
    const port = ttydStatus?.listen_port || 8080
    return `http://64.226.119.50:${port}`
  }, [ttydStatus])

  // Get SSH info for ttyd
  const getSSHInfo = () => {
    // Get SSH info from ttydStatus if available
    if (ttydStatus && ttydStatus.ssh_user && ttydStatus.ssh_user !== 'unknown') {
      return {
        user: ttydStatus.ssh_user,
        host: 'localhost',  // Always localhost for route proxy
        port: ttydStatus.ssh_port || ttydSshPort || 22
      }
    }
    
    // Use current state values (which are set from route proxy)
    // Host is always localhost (route proxy runs locally)
    return {
      user: ttydSshUser,
      host: 'localhost',  // Always localhost for route proxy
      port: ttydSshPort
    }
  }

  // ttyd functions
  const handleCheckTTYD = async () => {
    if (!currentTunnelId) {
      alertError('Please select a tunnel first', 'No Tunnel Selected')
      return
    }

    setTtydLoading(true)
    setTtydError(null)
    try {
      const response = await api.get(`/commands/check-ttyd/${currentTunnelId}`)
      if (response.data.success) {
        setTtydStatus(response.data)
        // Populate form fields from status
        if (response.data.listen_port) setTtydListenPort(response.data.listen_port)
        if (response.data.username) setTtydUsername(response.data.username)
        if (response.data.ssh_user) setTtydSshUser(response.data.ssh_user)
        if (response.data.ssh_host) setTtydSshHost(response.data.ssh_host)
        if (response.data.ssh_port) setTtydSshPort(response.data.ssh_port)
        if (response.data.writable !== undefined) setTtydWritable(response.data.writable)
        if (response.data.shared_session !== undefined) setTtydSharedSession(response.data.shared_session)
      } else {
        setTtydError(response.data.error || response.data.message || 'Failed to check ttyd status')
        setTtydStatus(null)
      }
    } catch (err) {
      console.error('Error checking ttyd:', err)
      setTtydError(err.response?.data?.detail || err.message || 'Failed to check ttyd status')
      setTtydStatus(null)
    } finally {
      setTtydLoading(false)
    }
  }

  const handleStartTTYD = async () => {
    if (!currentTunnelId) {
      alertError('Please select a tunnel first', 'No Tunnel Selected')
      return
    }

    setTtydLoading(true)
    setTtydError(null)
    try {
      const response = await api.post(`/commands/start-ttyd/${currentTunnelId}`, {
        listen_port: ttydListenPort,
        username: ttydUsername,
        password: ttydPassword,
        ssh_user: ttydSshUser,
        ssh_host: ttydSshHost,
        ssh_port: ttydSshPort,
        writable: ttydWritable,
        shared_session: ttydSharedSession
      })
      if (response.data.success) {
        setTtydStatus(response.data)
        alertSuccess('ttyd started successfully', 'Success')
      } else {
        setTtydError(response.data.error || response.data.message || 'Failed to start ttyd')
        alertError('Failed to start ttyd', 'Error')
      }
    } catch (err) {
      console.error('Error starting ttyd:', err)
      setTtydError(err.response?.data?.detail || err.message || 'Failed to start ttyd')
      alertError('Failed to start ttyd', 'Error')
    } finally {
      setTtydLoading(false)
    }
  }

  const handleStopTTYD = async () => {
    if (!currentTunnelId) {
      alertError('Please select a tunnel first', 'No Tunnel Selected')
      return
    }

    setTtydLoading(true)
    setTtydError(null)
    try {
      const response = await api.post(`/commands/stop-ttyd/${currentTunnelId}`)
      if (response.data.success) {
        setTtydStatus(null)
        setTtydVisible(false)
        alertSuccess('ttyd stopped successfully', 'Success')
      } else {
        setTtydError(response.data.error || response.data.message || 'Failed to stop ttyd')
        alertError('Failed to stop ttyd', 'Error')
      }
    } catch (err) {
      console.error('Error stopping ttyd:', err)
      setTtydError(err.response?.data?.detail || err.message || 'Failed to stop ttyd')
      alertError('Failed to stop ttyd', 'Error')
    } finally {
      setTtydLoading(false)
    }
  }

  const showTTYD = () => {
    setTtydVisible(true)
  }

  const hideTTYD = () => {
    setTtydVisible(false)
  }

  // Auto-scroll shell output
  useEffect(() => {
    if (shellOutputRef.current) {
      shellOutputRef.current.scrollTop = shellOutputRef.current.scrollHeight
    }
  }, [shellOutput])

  const handleClose = () => {
    dispatch(closeModal())
  }

  if (!isModalOpen) return null

  const modalContent = (
    <div 
      className="fixed z-[1000] left-0 top-0 w-full h-full backdrop-blur-sm overflow-y-auto scrollbar-thin"
      style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
    >
      <div 
        className="rounded-xl w-full max-w-[85vw] max-h-[90vh] mx-auto my-2 shadow-2xl flex flex-col"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: `1px solid ${isLightMode ? 'var(--border-color)' : 'var(--accent-primary)'}`
        }}
      >
        {/* Header */}
        <div 
          className="p-2.5 flex justify-between items-center rounded-t-xl"
          style={{
            background: isLightMode 
              ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))' 
              : 'linear-gradient(to right, #667eea, #764ba2, #f093fb)',
            color: 'white'
          }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 backdrop-blur-sm rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.2)',
                borderColor: isLightMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.3)',
                color: 'white'
              }}
            >
              <i className="fas fa-cube text-sm"></i>
            </div>
            <div>
              <h3 className="text-base font-bold m-0" style={{ color: 'white' }}>Module Control Panel</h3>
              <p className="text-xs m-0" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Dynamic Remote Module Execution & Management</p>
              {currentTunnelInfo && (
                <p className="text-[10px] mt-1 font-medium" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  <i className="fas fa-link mr-1"></i>
                  Connection: {currentTunnelInfo.info}
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="w-8 h-8 backdrop-blur-sm border rounded-lg transition-all flex items-center justify-center text-sm"
            style={{
              backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
              borderColor: isLightMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)',
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
        <div className="p-3 overflow-y-auto flex-1 scrollbar-thin" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          {/* Tunnel ID */}
          <div className="mb-3">
            <label className="block mb-1 font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>Tunnel ID:</label>
            <input 
              type="text" 
              value={currentTunnelId || ''}
              readOnly 
              className="w-full p-1.5 border rounded font-mono text-xs overflow-x-auto whitespace-nowrap scrollbar-thin"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="text-center py-6">
              <LoadingSpinner message="Loading module structure..." />
            </div>
          ) : (
            <>
              {/* Category Tabs */}
              <div className="mb-3 overflow-x-auto whitespace-nowrap pb-2 flex gap-1.5 scrollbar-thin">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className="px-2.5 py-1.5 rounded-md font-semibold text-xs transition-all whitespace-nowrap border"
                    style={{
                      background: activeCategory === category.id
                        ? (isLightMode 
                            ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))'
                            : 'linear-gradient(to right, #667eea, #764ba2)')
                        : 'var(--bg-quaternary)',
                      color: activeCategory === category.id ? '#ffffff' : 'var(--text-secondary)',
                      borderColor: activeCategory === category.id 
                        ? 'var(--accent-primary)' 
                        : 'var(--border-color)',
                      boxShadow: activeCategory === category.id ? '0 4px 12px rgba(0, 0, 0, 0.15)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (activeCategory !== category.id) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                        e.currentTarget.style.color = 'var(--text-primary)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeCategory !== category.id) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }
                    }}
                  >
                    <i className={category.icon}></i> {category.label}
                  </button>
                ))}
              </div>

              {/* Category Contents */}
              <div className="min-h-[200px] mb-3">
                {/* Special Categories */}
                {activeCategory === 'cat-remote' && (
                  <div className="border rounded-lg p-3" style={{ backgroundColor: 'var(--bg-quaternary)', borderColor: 'var(--border-color)' }}>
                    <h4 className="mb-2 text-sm" style={{ color: 'var(--accent-primary)' }}>
                      <i className="fas fa-desktop"></i> Remote Desktop (VNC)
                    </h4>
                    <div className="text-center py-6">
                      <i className="fas fa-desktop text-4xl opacity-50 mb-2" style={{ color: 'var(--accent-primary)' }}></i>
                      <h3 className="m-0 mb-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>VNC Remote Desktop</h3>
                      <p className="m-0 text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>This feature requires special UI integration</p>
                      <p className="text-xs" style={{ color: 'var(--accent-primary)' }}>Use the original Module Control Panel for VNC functionality</p>
                    </div>
                  </div>
                )}

                {/* Original Shell - Only show when evilWinrmCommand doesn't exist and cat-shell is active */}
                {activeCategory === 'cat-shell' && !evilWinrmCommand && (
                      /* Otherwise, use the original Shell (pywinrm) */
                      <div className="border rounded-lg p-3" style={{ backgroundColor: 'var(--bg-quaternary)', borderColor: 'var(--border-color)' }}>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="m-0 text-sm" style={{ color: 'var(--accent-primary)' }}>
                            <i className="fas fa-terminal"></i> Interactive Shell
                          </h4>
                          <div className="flex gap-1.5 border rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                            <button
                              onClick={() => setShellType('cmd')}
                              className="px-2.5 py-1.5 text-xs font-semibold transition-all"
                              style={{
                                background: shellType === 'cmd'
                                  ? (isLightMode 
                                      ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))'
                                      : 'linear-gradient(to right, #667eea, #764ba2)')
                                  : 'transparent',
                                color: shellType === 'cmd' ? '#ffffff' : 'var(--text-secondary)'
                              }}
                              onMouseEnter={(e) => {
                                if (shellType !== 'cmd') {
                                  e.currentTarget.style.color = 'var(--text-primary)'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (shellType !== 'cmd') {
                                  e.currentTarget.style.color = 'var(--text-secondary)'
                                }
                              }}
                              title="Command Prompt (CMD)"
                            >
                              <i className="fas fa-terminal"></i> CMD
                            </button>
                            <button
                              onClick={() => setShellType('powershell')}
                              className="px-2.5 py-1.5 text-xs font-semibold transition-all"
                              style={{
                                background: shellType === 'powershell'
                                  ? (isLightMode 
                                      ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))'
                                      : 'linear-gradient(to right, #667eea, #764ba2)')
                                  : 'transparent',
                                color: shellType === 'powershell' ? '#ffffff' : 'var(--text-secondary)'
                              }}
                              onMouseEnter={(e) => {
                                if (shellType !== 'powershell') {
                                  e.currentTarget.style.color = 'var(--text-primary)'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (shellType !== 'powershell') {
                                  e.currentTarget.style.color = 'var(--text-secondary)'
                                }
                              }}
                              title="PowerShell"
                            >
                              <i className="fab fa-microsoft"></i> PowerShell
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <button 
                            onClick={handleClearShellOutput} 
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                            style={{ backgroundColor: 'var(--danger)', color: '#ffffff' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = isLightMode ? '#c82333' : '#c82333'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--danger)'
                            }}
                          >
                            <i className="fas fa-trash"></i>
                            <span>Clear</span>
                          </button>
                        </div>
                        <div 
                          ref={shellOutputRef}
                          className="border rounded p-2.5 min-h-[250px] max-h-[350px] overflow-y-auto font-mono text-xs mb-2 whitespace-pre-wrap scrollbar-thin"
                          style={{ 
                            backgroundColor: 'var(--bg-secondary)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                        >
                          {shellOutput.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)' }}>No commands executed yet...</div>
                          ) : (
                            shellOutput.map((output, index) => (
                              <div
                                key={index}
                                style={{ color: getOutputColor(output.type), marginBottom: '2px' }}
                              >
                                {output.type === 'prompt' ? '$' : output.text}
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex items-start gap-2 border rounded p-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                          <span className="font-mono font-bold text-xs mt-1.5" style={{ color: 'var(--text-primary)' }}>$</span>
                          <textarea 
                            ref={shellInputRef}
                            value={shellInput}
                            onChange={(e) => {
                              dispatch(setShellInput(e.target.value))
                              autoResizeTextarea(e)
                            }}
                            onKeyDown={handleShellKeyPress}
                            placeholder="Enter command or script (Ctrl+Enter or Shift+Enter to execute)..." 
                            className="flex-1 p-1.5 bg-transparent border-none font-mono outline-none text-xs resize-y min-h-[32px] max-h-[150px] leading-normal overflow-y-auto scrollbar-thin"
                            style={{ color: 'var(--text-primary, #e0e0e0)' }}
                            disabled={shellExecuting}
                          />
                        </div>
                      </div>
                    )}

                {activeCategory === 'cat-ttyd' && (
                  <div className="border rounded-lg p-5" style={{ backgroundColor: 'var(--bg-quaternary)', borderColor: 'var(--border-color)' }}>
                    <h4 className="mb-4 text-base" style={{ color: 'var(--accent-primary)' }}>
                      <i className="fas fa-terminal"></i> ttyd (Real-time SSH Terminal)
                    </h4>
                    
                    {/* Show message if tunnel is not SSH-based */}
                    {!isSSHTunnel && (
                      <div 
                        className="mb-4 p-5 border-2 rounded-lg text-base shadow-lg"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          borderColor: isLightMode ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 165, 0, 0.3)',
                          color: 'var(--warning)'
                        }}
                      >
                        <i className="fas fa-exclamation-triangle text-xl"></i> <strong className="text-lg">SSH Connection Required</strong>
                        <div className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          ttyd is only available for tunnels connected via SSH. This tunnel is connected via {tunnelsState.tunnels.find(t => t.id === currentTunnelId)?.connection_type || 'WinRM'}.
                        </div>
                      </div>
                    )}
                    
                    {isSSHTunnel && (
                      <>
                        {/* Initial State - Show Check Status button if not checked yet */}
                        {!ttydLoading && !ttydStatus && !ttydError && (
                          <div 
                            className="mb-4 p-6 border-2 rounded-lg text-base text-center shadow-lg"
                            style={{
                              backgroundColor: 'var(--bg-secondary)',
                              borderColor: 'var(--border-color)'
                            }}
                          >
                            <p className="mb-5 text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Click the button below to check ttyd status</p>
                            <button 
                              onClick={handleCheckTTYD} 
                              className="px-6 py-3 rounded-lg font-semibold transition-all"
                              style={{
                                backgroundColor: isLightMode ? '#6f42c1' : '#6f42c1',
                                color: '#ffffff'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#5a32a3'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#6f42c1'
                              }}
                            >
                              <i className="fas fa-check"></i> Check Status
                            </button>
                          </div>
                        )}
                        
                        {/* Loading State */}
                        {ttydLoading && (
                          <div 
                            className="mb-4 p-6 border-2 rounded-lg text-base text-center"
                            style={{
                              backgroundColor: 'var(--bg-secondary)',
                              borderColor: 'var(--border-color)',
                              color: 'var(--accent-primary)'
                            }}
                          >
                            <i className="fas fa-spinner fa-spin text-xl"></i> <span className="ml-2">Checking status...</span>
                          </div>
                        )}
                        
                        {/* Status and Configuration */}
                        {(ttydStatus || ttydError) && !ttydLoading && (
                          <>
                            {/* ttyd Status */}
                            {ttydStatus && (
                              <div 
                                className="mb-4 p-5 border-2 rounded-lg text-base shadow-lg"
                                style={{
                                  backgroundColor: 'var(--bg-secondary)',
                                  borderColor: 'var(--border-color)'
                                }}
                              >
                                {ttydStatus.running ? (
                                  <div style={{ color: 'var(--success)' }}>
                                    <i className="fas fa-check-circle text-xl"></i> <strong className="text-lg">ttyd is running</strong>
                                    <div className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                      Listen Port: <strong>{ttydStatus.listen_port}</strong> | 
                                      SSH: <strong>{getSSHInfo().user}@{getSSHInfo().host}:{getSSHInfo().port}</strong> | 
                                      PID: <strong>{ttydStatus.pid}</strong>
                                    </div>
                                  </div>
                                ) : ttydStatus.ttyd_installed === false ? (
                                  <div style={{ color: 'var(--danger)' }}>
                                    <i className="fas fa-times-circle text-xl"></i> <strong className="text-lg">ttyd Not Installed</strong>
                                    <div className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }} dangerouslySetInnerHTML={{ __html: ttydError ? ttydError.replace(/\n/g, '<br>') : 'ttyd is not installed on this system. Please install it first.' }}></div>
                                    <div className="mt-4 pt-4 border-t" style={{ borderTopColor: 'var(--border-color)' }}>
                                      <i className="fas fa-lock"></i> <strong className="text-base" style={{ color: 'var(--text-primary)' }}>Configuration Disabled</strong>
                                      <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                        ttyd must be installed on this system before you can configure it.
                                      </div>
                                      <button 
                                        onClick={handleCheckTTYD} 
                                        disabled={ttydLoading} 
                                        className={`mt-4 px-4 py-2.5 rounded-lg font-semibold w-full transition-all ${ttydLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        style={{
                                          backgroundColor: '#6f42c1',
                                          color: '#ffffff'
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!ttydLoading) {
                                            e.currentTarget.style.backgroundColor = '#5a32a3'
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = '#6f42c1'
                                        }}
                                      >
                                        <i className="fas fa-redo"></i> Check Again
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ color: 'var(--warning)' }}>
                                    <i className="fas fa-exclamation-triangle text-xl"></i> <strong className="text-lg">ttyd is not running</strong>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {ttydError && !ttydStatus && (
                              <div 
                                className="mb-4 p-5 border-2 rounded-lg text-base shadow-lg"
                                style={{
                                  backgroundColor: 'var(--bg-secondary)',
                                  borderColor: isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)',
                                  color: 'var(--danger)'
                                }}
                              >
                                <div className="text-sm" dangerouslySetInnerHTML={{ __html: ttydError.replace(/\n/g, '<br>') }}></div>
                                <button 
                                  onClick={handleCheckTTYD} 
                                  disabled={ttydLoading} 
                                  className={`mt-4 px-4 py-2.5 rounded-lg font-semibold w-full transition-all ${ttydLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  style={{
                                    backgroundColor: '#6f42c1',
                                    color: '#ffffff'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!ttydLoading) {
                                      e.currentTarget.style.backgroundColor = '#5a32a3'
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#6f42c1'
                                  }}
                                >
                                  <i className="fas fa-redo"></i> Check Again
                                </button>
                              </div>
                            )}
                            
                            {/* ttyd Configuration - Only show if ttyd is installed */}
                            {ttydStatus && ttydStatus.ttyd_installed !== false && ttydStatus.ttyd_installed !== null && (
                              <div className="mb-4 p-3 border rounded" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                                <div className="grid grid-cols-2 gap-2.5 mb-3">
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Listen Port:</label>
                                    <input 
                                      type="number" 
                                      value={ttydListenPort}
                                      onChange={(e) => setTtydListenPort(parseInt(e.target.value) || 8080)}
                                      min="1" 
                                      max="65535"
                                      disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                      className="w-full p-2 border rounded text-xs focus:outline-none transition-colors"
                                      style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                        cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'text'
                                      }}
                                      onFocus={(e) => {
                                        if (!(ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null))) {
                                          e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                        }
                                      }}
                                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Writable (--writable):</label>
                                    <div className="flex items-center gap-2 mt-2">
                                      <input 
                                        type="checkbox" 
                                        checked={ttydWritable}
                                        onChange={(e) => setTtydWritable(e.target.checked)}
                                        disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                        className="w-4 h-4 rounded border-2"
                                        style={{
                                          accentColor: 'var(--accent-primary)',
                                          backgroundColor: 'var(--bg-tertiary)',
                                          borderColor: 'var(--border-color)',
                                          opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                          cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'pointer'
                                        }}
                                      />
                                      <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Enable writable mode</label>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Shared Session (tmux):</label>
                                    <div className="flex items-center gap-2 mt-2">
                                      <input 
                                        type="checkbox" 
                                        checked={ttydSharedSession}
                                        onChange={(e) => setTtydSharedSession(e.target.checked)}
                                        disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                        className="w-4 h-4 rounded border-2"
                                        style={{
                                          accentColor: 'var(--accent-primary)',
                                          backgroundColor: 'var(--bg-tertiary)',
                                          borderColor: 'var(--border-color)',
                                          opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                          cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'pointer'
                                        }}
                                      />
                                      <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Enable shared session (all users share same tmux session)</label>
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5 mb-3">
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Username (-c username:password):</label>
                                    <input 
                                      type="text" 
                                      value={ttydUsername}
                                      onChange={(e) => setTtydUsername(e.target.value)}
                                      disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                      className="w-full p-2 border rounded text-xs focus:outline-none transition-colors"
                                      style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                        cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'text'
                                      }}
                                      onFocus={(e) => {
                                        if (!(ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null))) {
                                          e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                        }
                                      }}
                                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Password (-c username:password):</label>
                                    <input 
                                      type="password" 
                                      value={ttydPassword}
                                      onChange={(e) => setTtydPassword(e.target.value)}
                                      disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                      className="w-full p-2 border rounded text-xs focus:outline-none transition-colors"
                                      style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                        cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'text'
                                      }}
                                      onFocus={(e) => {
                                        if (!(ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null))) {
                                          e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                        }
                                      }}
                                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2.5 mb-3">
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>SSH User:</label>
                                    <input 
                                      type="text" 
                                      value={ttydSshUser}
                                      onChange={(e) => setTtydSshUser(e.target.value)}
                                      disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                      className="w-full p-2 border rounded text-xs focus:outline-none transition-colors"
                                      style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                        cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'text'
                                      }}
                                      onFocus={(e) => {
                                        if (!(ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null))) {
                                          e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                        }
                                      }}
                                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>SSH Host:</label>
                                    <input 
                                      type="text" 
                                      value={ttydSshHost}
                                      onChange={(e) => setTtydSshHost(e.target.value)}
                                      disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                      className="w-full p-2 border rounded text-xs focus:outline-none transition-colors"
                                      style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                        cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'text'
                                      }}
                                      onFocus={(e) => {
                                        if (!(ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null))) {
                                          e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                        }
                                      }}
                                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>SSH Port:</label>
                                    <input 
                                      type="number" 
                                      value={ttydSshPort}
                                      onChange={(e) => setTtydSshPort(parseInt(e.target.value) || 2222)}
                                      min="1" 
                                      max="65535"
                                      disabled={ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null)}
                                      className="w-full p-2 border rounded text-xs focus:outline-none transition-colors"
                                      style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-primary)',
                                        opacity: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 0.5 : 1,
                                        cursor: ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null) ? 'not-allowed' : 'text'
                                      }}
                                      onFocus={(e) => {
                                        if (!(ttydStatus && (ttydStatus.ttyd_installed === false || ttydStatus.ttyd_installed === null))) {
                                          e.currentTarget.style.borderColor = 'var(--accent-primary)'
                                        }
                                      }}
                                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2.5">
                                  <button 
                                    onClick={handleCheckTTYD} 
                                    disabled={ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false)} 
                                    className="px-4 py-2 rounded-lg font-semibold flex-1 transition-all"
                                    style={{
                                      backgroundColor: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false)) ? (isLightMode ? '#6c757d' : '#4e5560') : '#6f42c1',
                                      color: '#ffffff',
                                      opacity: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false)) ? 0.5 : 1,
                                      cursor: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false)) ? 'not-allowed' : 'pointer'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!ttydLoading && !(ttydStatus && ttydStatus.ttyd_installed === false)) {
                                        e.currentTarget.style.backgroundColor = '#5a32a3'
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!ttydLoading && !(ttydStatus && ttydStatus.ttyd_installed === false)) {
                                        e.currentTarget.style.backgroundColor = '#6f42c1'
                                      }
                                    }}
                                  >
                                    <i className="fas fa-check"></i> Check Status
                                  </button>
                                  <button 
                                    onClick={handleStartTTYD} 
                                    disabled={ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)} 
                                    className="px-4 py-2 rounded-lg font-semibold flex-1 transition-all"
                                    style={{
                                      backgroundColor: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)) ? (isLightMode ? '#6c757d' : '#4e5560') : 'var(--success)',
                                      color: '#ffffff',
                                      opacity: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)) ? 0.5 : 1,
                                      cursor: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)) ? 'not-allowed' : 'pointer'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!ttydLoading && !(ttydStatus && ttydStatus.ttyd_installed === false) && !(ttydStatus && ttydStatus.ttyd_installed === null)) {
                                        e.currentTarget.style.backgroundColor = '#218838'
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!ttydLoading && !(ttydStatus && ttydStatus.ttyd_installed === false) && !(ttydStatus && ttydStatus.ttyd_installed === null)) {
                                        e.currentTarget.style.backgroundColor = 'var(--success)'
                                      }
                                    }}
                                  >
                                    <i className="fas fa-play"></i> Start
                                  </button>
                                  <button 
                                    onClick={handleStopTTYD} 
                                    disabled={ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)} 
                                    className="px-4 py-2 rounded-lg font-semibold flex-1 transition-all"
                                    style={{
                                      backgroundColor: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)) ? (isLightMode ? '#6c757d' : '#4e5560') : 'var(--danger)',
                                      color: '#ffffff',
                                      opacity: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)) ? 0.5 : 1,
                                      cursor: (ttydLoading || (ttydStatus && ttydStatus.ttyd_installed === false) || (ttydStatus && ttydStatus.ttyd_installed === null)) ? 'not-allowed' : 'pointer'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!ttydLoading && !(ttydStatus && ttydStatus.ttyd_installed === false) && !(ttydStatus && ttydStatus.ttyd_installed === null)) {
                                        e.currentTarget.style.backgroundColor = '#c82333'
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!ttydLoading && !(ttydStatus && ttydStatus.ttyd_installed === false) && !(ttydStatus && ttydStatus.ttyd_installed === null)) {
                                        e.currentTarget.style.backgroundColor = 'var(--danger)'
                                      }
                                    }}
                                  >
                                    <i className="fas fa-stop"></i> Stop
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            {/* ttyd Buttons */}
                            {ttydStatus?.running && ttydStatus?.listen_port && (
                              <div className="flex gap-2.5 mb-4">
                                <button 
                                  onClick={showTTYD} 
                                  className="px-4 py-2 rounded-lg font-semibold flex-1 transition-all"
                                  style={{
                                    backgroundColor: 'var(--success)',
                                    color: '#ffffff'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#218838'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--success)'
                                  }}
                                >
                                  <i className="fas fa-terminal"></i> Show Terminal
                                </button>
                                <a 
                                  href={ttydUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-4 py-2 rounded-lg font-semibold flex-1 transition-all text-center no-underline flex items-center justify-center"
                                  style={{
                                    backgroundColor: 'var(--info)',
                                    color: '#ffffff'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#138496'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--info)'
                                  }}
                                >
                                  <i className="fas fa-external-link-alt"></i> Open in New Tab
                                </a>
                              </div>
                            )}
                            
                            {/* ttyd Iframe */}
                            {ttydVisible && (
                              <div className="mt-4">
                                <div className="flex justify-between items-center mb-2.5">
                                  <h5 className="m-0" style={{ color: 'var(--accent-primary)' }}>ttyd Terminal</h5>
                                  <button 
                                    onClick={hideTTYD} 
                                    className="px-4 py-2 rounded text-xs transition-all"
                                    style={{
                                      backgroundColor: isLightMode ? '#6c757d' : '#6c757d',
                                      color: '#ffffff'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#5a6268'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#6c757d'
                                    }}
                                  >
                                    <i className="fas fa-times"></i> Hide
                                  </button>
                                </div>
                                <div className="border rounded" style={{ borderColor: 'var(--border-color)' }}>
                                  <iframe 
                                    id="ttydIframe"
                                    src={ttydUrl}
                                    className="w-full h-[600px] border-0 rounded"
                                    title="ttyd Terminal"
                                  ></iframe>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}


                {/* Regular Categories */}
                {regularCategories.map((category) => (
                  <div
                    key={category.id}
                    className={activeCategory === category.id ? 'block' : 'hidden'}
                  >
                    {/* Sections Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {getSectionsByCategory(category.id).map((section) => (
                        <div
                          key={section.id}
                          className="border rounded-lg p-3 transition-all"
                          style={{ 
                            backgroundColor: isLightMode ? 'var(--bg-secondary)' : 'var(--bg-quaternary)', 
                            borderColor: 'var(--border-color)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-primary)'
                            e.currentTarget.style.boxShadow = isLightMode 
                              ? '0 4px 12px rgba(102, 126, 234, 0.15)' 
                              : '0 4px 12px rgba(102, 126, 234, 0.2)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-color)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          {/* Section Header */}
                          <h4 className="mb-2 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--accent-primary)' }}>
                            {section.icon && <i className={section.icon}></i>} {section.label}
                          </h4>
                          
                          {/* Items */}
                          <div className="flex flex-col gap-1.5">
                            {getItemsBySection(section.id).map((item) => (
                              <button
                                key={item.id}
                                onClick={() => executeModuleItem(item)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                                style={{
                                  background: item.requires_admin
                                    ? (isLightMode 
                                        ? 'linear-gradient(to right, var(--danger), #c82333)' 
                                        : 'linear-gradient(to right, var(--danger), #c82333)')
                                    : (isLightMode 
                                        ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))'
                                        : 'linear-gradient(to right, #667eea, #764ba2)'),
                                  color: '#ffffff',
                                  boxShadow: 'none'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateY(-2px)'
                                  e.currentTarget.style.boxShadow = isLightMode 
                                    ? '0 4px 12px rgba(102, 126, 234, 0.3)' 
                                    : '0 4px 12px rgba(102, 126, 234, 0.4)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateY(0)'
                                  e.currentTarget.style.boxShadow = 'none'
                                }}
                                title={item.description}
                              >
                                {item.icon && <i className={item.icon}></i>}
                                {item.label}
                                {item.requires_admin && (
                                  <i className="fas fa-shield-alt text-xs"></i>
                                )}
                              </button>
                            ))}
                          </div>
                          
                          {/* Empty State */}
                          {getItemsBySection(section.id).length === 0 && (
                            <div className="text-center py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              <i className="fas fa-inbox opacity-50"></i>
                              <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>No items in this section</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* Empty Category State */}
                    {getSectionsByCategory(category.id).length === 0 && (
                      <div className="text-center py-10">
                        <i className="fas fa-folder-open text-5xl opacity-50 mb-4" style={{ color: 'var(--text-secondary)' }}></i>
                        <h3 className="m-0 mb-2.5" style={{ color: 'var(--text-primary)' }}>No sections in this category</h3>
                        <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>Configure sections in Settings → Module Control</p>
                      </div>
                    )}
                  </div>
                ))}

                {/* Command Output Panel - Only for regular categories (not shell/remote/ttyd) and when evilwinrm is not active */}
                {regularCategories.some(cat => cat.id === activeCategory) && !evilWinrmCommand && (
                  <div className="mt-3 border rounded-lg p-3" style={{ backgroundColor: 'var(--bg-quaternary)', borderColor: 'var(--border-color)' }}>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="m-0 text-sm" style={{ color: 'var(--accent-primary)' }}>
                    <i className="fas fa-terminal"></i> Command Output
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <div className="flex border rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                      <button
                        onClick={() => setModuleExecutionType('cmd')}
                        className="px-2.5 py-1.5 text-xs font-semibold transition-all"
                        style={{
                          background: moduleExecutionType === 'cmd'
                            ? (isLightMode 
                                ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))'
                                : 'linear-gradient(to right, #667eea, #764ba2)')
                            : 'transparent',
                          color: moduleExecutionType === 'cmd' ? '#ffffff' : 'var(--text-secondary)'
                        }}
                        onMouseEnter={(e) => {
                          if (moduleExecutionType !== 'cmd') {
                            e.currentTarget.style.color = 'var(--text-primary)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (moduleExecutionType !== 'cmd') {
                            e.currentTarget.style.color = 'var(--text-secondary)'
                          }
                        }}
                        title="Command Prompt (CMD)"
                      >
                        <i className="fas fa-terminal"></i> CMD
                      </button>
                      <button
                        onClick={() => setModuleExecutionType('powershell')}
                        className="px-2.5 py-1.5 text-xs font-semibold transition-all"
                        style={{
                          background: moduleExecutionType === 'powershell'
                            ? (isLightMode 
                                ? 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))'
                                : 'linear-gradient(to right, #667eea, #764ba2)')
                            : 'transparent',
                          color: moduleExecutionType === 'powershell' ? '#ffffff' : 'var(--text-secondary)'
                        }}
                        onMouseEnter={(e) => {
                          if (moduleExecutionType !== 'powershell') {
                            e.currentTarget.style.color = 'var(--text-primary)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (moduleExecutionType !== 'powershell') {
                            e.currentTarget.style.color = 'var(--text-secondary)'
                          }
                        }}
                        title="PowerShell"
                      >
                        <i className="fab fa-microsoft"></i> PowerShell
                      </button>
                    </div>
                  </div>
                </div>
                <div className="border rounded p-2.5 min-h-[200px] max-h-[300px] overflow-y-auto font-mono text-xs whitespace-pre-wrap scrollbar-thin" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  {commandOutput.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)' }}>No commands executed yet...</div>
                  ) : (
                    commandOutput.map((output, index) => (
                      <div
                        key={index}
                        style={{ color: getOutputColor(output.type), marginBottom: '2px' }}
                      >
                        {output.text}
                      </div>
                    ))
                  )}
                </div>
                  </div>
                )}

                {/* Terminal Modal - Always visible when evilWinrmCommand exists, persists across all tabs */}
                {evilWinrmCommand && (
                  <div 
                    className="mt-3 border rounded-lg p-3"
                    style={{ 
                      backgroundColor: 'var(--bg-quaternary)', 
                      borderColor: 'var(--border-color)',
                      minHeight: '500px' 
                    }}
                  >
                    <TerminalModal
                      command={evilWinrmCommand}
                      title="Interactive Shell"
                      inline={true}
                      externalCommand={externalCommand}
                      onClose={() => {
                        // Don't close modal, just clear command
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ModuleModalDynamic

