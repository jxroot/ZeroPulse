import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { createPortal } from 'react-dom'
import { alertError } from '../../utils/alert'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const TerminalModal = ({ command, onClose, title = 'Terminal', inline = false, externalCommand = null }) => {
  const auth = useSelector(state => state.auth)
  const [connected, setConnected] = useState(false)
  const [terminalReady, setTerminalReady] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const terminalInstanceRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const modalRef = useRef(null)
  const commandExecutedRef = useRef(false)
  const lastCommandRef = useRef(null)
  const lastExternalCommandRef = useRef(null)
  const connectingRef = useRef(false)

  useEffect(() => {
    // Initialize terminal
    if (containerRef.current && !terminalInstanceRef.current) {
      const terminal = new Terminal({
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#aeafad',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5',
        },
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 1000,
        tabStopWidth: 4,
        convertEol: true,
        disableStdin: false,
        allowTransparency: false,
        windowsMode: true,
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      
      terminal.open(containerRef.current)
      fitAddon.fit()

      terminalInstanceRef.current = terminal
      fitAddonRef.current = fitAddon
      setTerminalReady(true)

      // Handle terminal input
      terminal.onData((data) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'command', data: data }))
        }
      })

      // Handle resize
      const handleResize = () => {
        if (fitAddonRef.current && terminalInstanceRef.current && (!inline || !isMinimized)) {
          fitAddonRef.current.fit()
          // Send resize to backend
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const terminal = terminalInstanceRef.current
            if (terminal) {
              wsRef.current.send(JSON.stringify({
                type: 'resize',
                rows: terminal.rows || 24,
                cols: terminal.cols || 80
              }))
            }
          }
        }
      }

      window.addEventListener('resize', handleResize)
      
      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize)
        terminal.dispose()
        terminalInstanceRef.current = null
        fitAddonRef.current = null
      }
    }
  }, [inline])

  useEffect(() => {
    // Auto-connect when modal opens and terminal is initialized
    // Only connect if not already connected and not currently connecting
    if (terminalReady && !connected && !wsRef.current && !connectingRef.current) {
      connectingRef.current = true
      connectWebSocket()
    }
  }, [terminalReady, connected])

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose()
      }
    }
  }, [])

  // Handle external commands (from module items)
  useEffect(() => {
    if (externalCommand && externalCommand !== lastExternalCommandRef.current) {
      lastExternalCommandRef.current = externalCommand
      
      // Extract command from format "timestamp:command"
      const commandParts = externalCommand.split(':')
      const actualCommand = commandParts.length > 1 ? commandParts.slice(1).join(':') : externalCommand
      
      // Function to send command
      const sendCommand = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && terminalInstanceRef.current) {
          const terminal = terminalInstanceRef.current
          // Write command to terminal and send via WebSocket
          terminal.write(`\r\n\x1b[33m[Executing Module Command]\x1b[0m\r\n`)
          wsRef.current.send(JSON.stringify({ type: 'command', data: actualCommand + '\n' }))
          return true
        }
        return false
      }
      
      // Try to send immediately
      let checkConnectionInterval = null
      let timeoutId = null
      
      if (!sendCommand() && terminalInstanceRef.current) {
        // If not connected yet, wait a bit and try again
        checkConnectionInterval = setInterval(() => {
          if (sendCommand()) {
            if (checkConnectionInterval) {
              clearInterval(checkConnectionInterval)
              checkConnectionInterval = null
            }
            if (timeoutId) {
              clearTimeout(timeoutId)
              timeoutId = null
            }
          }
        }, 100)
        
        // Clear interval after 5 seconds if still not connected
        timeoutId = setTimeout(() => {
          if (checkConnectionInterval) {
            clearInterval(checkConnectionInterval)
            checkConnectionInterval = null
          }
        }, 5000)
      }
      
      // Cleanup function to prevent memory leaks
      return () => {
        if (checkConnectionInterval) {
          clearInterval(checkConnectionInterval)
        }
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }
  }, [externalCommand])

  const connectWebSocket = () => {
    // Prevent duplicate connections
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      connectingRef.current = false
      return
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      // Already connecting, don't create another connection
      return
    }

    const token = auth.token || localStorage.getItem('auth_token')
    if (!token) {
      alertError('Authentication token not found', 'Error')
      connectingRef.current = false
      return
    }

    // Ensure terminal is initialized
    if (!terminalInstanceRef.current) {
      alertError('Terminal not initialized. Please refresh the page.', 'Error')
      connectingRef.current = false
      return
    }

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/local-shell?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(wsUrl)
    const terminal = terminalInstanceRef.current

    ws.onopen = () => {
      connectingRef.current = false
      setConnected(true)
      const isReconnect = lastCommandRef.current !== null
      
      if (terminal && !isReconnect) {
        // Only show connection message on first connection
        terminal.writeln('\x1b[32m✓ Connected to local shell\x1b[0m')
      }
      
      // Fit terminal first
      if (fitAddonRef.current && terminal) {
        fitAddonRef.current.fit()
        // Send terminal size
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              rows: terminal.rows || 24,
              cols: terminal.cols || 80
            }))
          }
        }, 100)
      }
      
      // Execute command if provided and not already executed for this command
      // Only execute if this is a new command or first connection
      if (command && lastCommandRef.current !== command) {
        // New command - reset and execute
        commandExecutedRef.current = false
        lastCommandRef.current = command
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN && terminal) {
            terminal.write(`\x1b[33mExecuting: ${command}\x1b[0m\r\n`)
            ws.send(JSON.stringify({ type: 'command', data: command + '\n' }))
          }
        }, 500)
        commandExecutedRef.current = true
      } else if (command && lastCommandRef.current === command && !commandExecutedRef.current) {
        // Same command but not executed yet - execute it
        commandExecutedRef.current = true
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN && terminal) {
            terminal.write(`\x1b[33mExecuting: ${command}\x1b[0m\r\n`)
            ws.send(JSON.stringify({ type: 'command', data: command + '\n' }))
          }
        }, 500)
      } else if (!command && !lastCommandRef.current) {
        // Normal connection - just send newline (only if no command was ever executed)
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'command', data: '\n' }))
          }
        }, 200)
      }
      // If command was already executed and it's the same command, do nothing (reconnection)
    }

    ws.onmessage = (event) => {
      if (!terminal) return

      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'output') {
          // Write raw output to terminal
          // xterm.js handles ANSI codes and carriage returns automatically
          const output = data.data || ''
          // Ensure proper line handling - xterm.js should handle \r\n correctly
          terminal.write(output)
        } else if (data.type === 'error') {
          terminal.write(`\x1b[31m${data.data || ''}\x1b[0m`)
        } else if (data.type === 'exit') {
          terminal.writeln(`\x1b[33mProcess exited with code ${data.code}\x1b[0m`)
        }
      } catch (err) {
        // If not JSON, treat as raw text
        terminal.write(event.data)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      connectingRef.current = false
      alertError('WebSocket connection error', 'Error')
      setConnected(false)
      if (terminal) {
        terminal.writeln('\x1b[31m✗ Connection error\x1b[0m')
      }
    }

    ws.onclose = () => {
      connectingRef.current = false
      setConnected(false)
      if (terminal) {
        terminal.writeln('\x1b[31m✗ Disconnected from local shell\x1b[0m')
      }
    }

    wsRef.current = ws
  }

  const handleClose = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose()
      terminalInstanceRef.current = null
    }
    setTerminalReady(false)
    setConnected(false)
    commandExecutedRef.current = false
    if (onClose) {
      onClose()
    }
  }


  const handleMinimize = () => {
    setIsMinimized(!isMinimized)
  }

  const handleMouseDown = (e) => {
    if (e.target === headerRef.current || headerRef.current?.contains(e.target)) {
      setIsDragging(true)
      const rect = modalRef.current?.getBoundingClientRect()
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        })
      }
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging && modalRef.current) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragOffset])

  const clearTerminal = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear()
    }
  }

  if (inline) {
    // Inline mode - render directly without portal and modal wrapper
    return (
      <div className="w-full h-full">
        <div
          ref={containerRef}
          className="w-full"
          style={{
            backgroundColor: '#1e1e1e',
            minHeight: '400px',
            height: '500px'
          }}
        />
      </div>
    )
  }

  const modalContent = (
    <div 
      className="fixed z-[2000] left-0 top-0 w-full h-full bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <div
        ref={modalRef}
        className={`absolute bg-[#2b2b40] border border-gray-700 rounded-lg shadow-2xl overflow-hidden transition-all ${
          isMinimized ? 'w-96 h-16' : 'w-[90vw] h-[85vh] max-w-[1200px] max-h-[800px]'
        }`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        {/* Header */}
        <div
          ref={headerRef}
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-500 cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <i className="fas fa-terminal text-white"></i>
            <h3 className="text-white font-semibold m-0">{title}</h3>
            {connected && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                <span className="text-white text-xs">Connected</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearTerminal}
              className="w-8 h-8 rounded hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              title="Clear Terminal"
            >
              <i className="fas fa-trash text-sm"></i>
            </button>
            <button
              onClick={handleMinimize}
              className="w-8 h-8 rounded hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              title={isMinimized ? 'Maximize' : 'Minimize'}
            >
              <i className={`fas ${isMinimized ? 'fa-window-maximize' : 'fa-window-minimize'} text-sm`}></i>
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded hover:bg-red-500 flex items-center justify-center text-white transition-colors"
              title="Close"
            >
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
        </div>

        {/* Terminal Container */}
        {!isMinimized && (
          <div
            ref={containerRef}
            className="w-full h-[calc(100%-48px)]"
            style={{
              backgroundColor: '#1e1e1e',
              minHeight: '400px'
            }}
          />
        )}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default TerminalModal

