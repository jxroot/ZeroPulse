import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { useSearchParams, useLocation } from 'react-router-dom'
import { alertError } from '../../utils/alert'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const LocalShellTab = () => {
  const auth = useSelector(state => state.auth)
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [connected, setConnected] = useState(false)
  const isStandaloneWindow = location.pathname === '/local-shell'
  const terminalInstanceRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)
  const containerRef = useRef(null)
  const autoCommandRef = useRef(null)

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
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      
      terminal.open(containerRef.current)
      fitAddon.fit()

      terminalInstanceRef.current = terminal
      fitAddonRef.current = fitAddon

      // Handle terminal input
      terminal.onData((data) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'command', data: data }))
        }
      })

      // Handle resize
      const handleResize = () => {
        if (fitAddonRef.current && terminalInstanceRef.current) {
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
  }, [])

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

  // Auto-connect and execute command if specified in URL params
  useEffect(() => {
    const autoConnect = searchParams.get('autoConnect')
    const command = searchParams.get('command')
    
    if (autoConnect === 'true' && command && terminalInstanceRef.current && !connected) {
      // Remove params from URL
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('autoConnect')
      newSearchParams.delete('command')
      setSearchParams(newSearchParams, { replace: true })
      
      // Store command to execute after connection
      autoCommandRef.current = decodeURIComponent(command)
      
      // Connect after a short delay
      setTimeout(() => {
        connectWebSocket()
      }, 500)
    }
  }, [searchParams])

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    const token = auth.token || localStorage.getItem('auth_token')
    if (!token) {
      alertError('Authentication token not found', 'Error')
      return
    }

    // Ensure terminal is initialized
    if (!terminalInstanceRef.current) {
      alertError('Terminal not initialized. Please refresh the page.', 'Error')
      return
    }

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/local-shell?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(wsUrl)
    const terminal = terminalInstanceRef.current

    ws.onopen = () => {
      setConnected(true)
      if (terminal) {
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
      
      // Send initial newline to get prompt, or execute auto-command if set
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          if (autoCommandRef.current) {
            // Execute auto-command
            const command = autoCommandRef.current
            if (terminal) {
              terminal.write(`\x1b[33mExecuting: ${command}\x1b[0m\r\n`)
            }
            ws.send(JSON.stringify({ type: 'command', data: command + '\n' }))
            autoCommandRef.current = null // Clear after execution
          } else {
            // Normal connection - just send newline
            ws.send(JSON.stringify({ type: 'command', data: '\n' }))
          }
        }
      }, 200)
    }

    ws.onmessage = (event) => {
      if (!terminal) return

      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'output') {
          // Write raw output to terminal
          terminal.write(data.data || '')
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
      alertError('WebSocket connection error', 'Error')
      setConnected(false)
      if (terminal) {
        terminal.writeln('\x1b[31m✗ Connection error\x1b[0m')
      }
    }

    ws.onclose = () => {
      setConnected(false)
      if (terminal) {
        terminal.writeln('\x1b[31m✗ Disconnected from local shell\x1b[0m')
      }
    }

    wsRef.current = ws
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }

  const handleConnect = () => {
    connectWebSocket()
  }

  const handleDisconnect = () => {
    disconnect()
  }

  const clearTerminal = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          <i className="fas fa-terminal mr-2 text-green-400"></i>
          Local Shell Access
        </h4>
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Connect/Disconnect Button */}
          {!connected ? (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <i className="fas fa-plug"></i>
              Connect
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
            >
              <i className="fas fa-unlink"></i>
              Disconnect
            </button>
          )}

          {/* Clear Button */}
          <button
            onClick={clearTerminal}
            className="px-3 py-2 rounded transition-colors"
            style={{ 
              backgroundColor: 'var(--bg-secondary)', 
              color: 'var(--text-secondary)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <i className="fas fa-trash"></i>
          </button>

          {/* Open in New Window Button - Only show when NOT in standalone window */}
          {!isStandaloneWindow && (
            <button
              onClick={() => {
                const width = 1200
                const height = 800
                const left = (window.screen.width - width) / 2
                const top = (window.screen.height - height) / 2
                const url = `${window.location.origin}/local-shell`
                window.open(
                  url,
                  'LocalShellWindow',
                  `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
                )
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              title="Open Local Shell in a new window"
            >
              <i className="fas fa-external-link-alt"></i>
              <span>Open in New Window</span>
            </button>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-start gap-3">
          <i className="fas fa-info-circle text-blue-400 mt-1"></i>
          <div className="flex-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <p className="mb-2">
              <strong style={{ color: 'var(--text-primary)' }}>Interactive shell access</strong> to the local system.
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>
              Full interactive terminal with persistent session. Type commands directly in the terminal below.
            </p>
          </div>
        </div>
      </div>

      {/* Terminal Container */}
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: '#1e1e1e',
          border: '1px solid var(--border-color)',
          minHeight: '500px',
          height: '600px',
          width: '100%'
        }}
      />
    </div>
  )
}

export default LocalShellTab
