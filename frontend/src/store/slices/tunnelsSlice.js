import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

// Initial state
const initialState = {
  tunnels: [],
  loading: false,
  error: null,
  tunnelsLoaded: false,
  restoringConnections: false,
  loadingPromise: null,
  healthCheckCache: {},
  winrmStatus: {},
  sshStatus: {}
}

// Async thunks
export const loadTunnels = createAsyncThunk(
  'tunnels/loadTunnels',
  async (force = false, { getState, rejectWithValue }) => {
    const state = getState().tunnels
    
    // If already loaded and not forcing, return early
    if (state.tunnelsLoaded && !force && state.tunnels.length > 0) {
      return state.tunnels
    }

    // If a load is already in progress, wait for it
    if (state.loadingPromise && !force) {
      return state.loadingPromise
    }

    try {
      const response = await api.get('/tunnels/')
      if (response.data && Array.isArray(response.data)) {
        return response.data
      }
      return []
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load tunnels')
    }
  }
)

export const refreshTunnels = createAsyncThunk(
  'tunnels/refreshTunnels',
  async (_, { dispatch }) => {
    await dispatch(loadTunnels(true))
    await dispatch(restoreConnectionStatus())
  }
)

export const testWinRM = createAsyncThunk(
  'tunnels/testWinRM',
  async (tunnelId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/commands/test-winrm/${tunnelId}`)
      return { tunnelId, data: response.data }
    } catch (err) {
      return rejectWithValue({ tunnelId, error: err.response?.data?.detail || err.message || 'Error testing WinRM' })
    }
  }
)

export const testSSH = createAsyncThunk(
  'tunnels/testSSH',
  async (tunnelId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/commands/test-ssh/${tunnelId}`)
      return { tunnelId, data: response.data }
    } catch (err) {
      return rejectWithValue({ tunnelId, error: err.response?.data?.detail || err.message || 'Error testing SSH' })
    }
  }
)

export const updateTunnelLabel = createAsyncThunk(
  'tunnels/updateTunnelLabel',
  async ({ tunnelId, label }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/tunnels/${tunnelId}/label`, { label })
      if (response.data.success) {
        return { tunnelId, label }
      }
      return rejectWithValue('Failed to update label')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update label')
    }
  }
)

export const disconnectConnection = createAsyncThunk(
  'tunnels/disconnectConnection',
  async ({ tunnelId, connectionType }, { rejectWithValue }) => {
    try {
      if (connectionType === 'ssh') {
        const response = await api.delete(`/ssh-sessions/${tunnelId}`)
        if (response.data.success) {
          return { tunnelId, connectionType, success: true }
        }
      } else if (connectionType === 'winrm') {
        return { tunnelId, connectionType, success: true }
      }
      return rejectWithValue('Invalid connection type')
    } catch (err) {
      // Even if API call fails, return success to reset local status
      return { tunnelId, connectionType, success: true }
    }
  }
)

export const restoreConnectionStatus = createAsyncThunk(
  'tunnels/restoreConnectionStatus',
  async (_, { getState, dispatch }) => {
    const state = getState().tunnels
    const healthy = state.tunnels.filter(t => t.status === 'healthy')
    
    if (healthy.length === 0) {
      return
    }

    const checkPromises = healthy.map(async (tunnel) => {
      try {
        const promises = [
          api.get(`/ssh-sessions/${tunnel.id}`)
            .then(response => ({ type: 'ssh', data: response.data }))
            .catch(() => ({ type: 'ssh', data: null })),
          api.get(`/commands/test-winrm/${tunnel.id}`)
            .then(response => ({ type: 'winrm', data: response.data }))
            .catch(() => ({ type: 'winrm', data: null }))
        ]
        
        const results = await Promise.allSettled(promises)
        // Transform results to match expected format
        const transformedResults = results.map(result => {
          if (result.status === 'fulfilled') {
            return result
          }
          return { status: 'rejected', reason: result.reason }
        })
        return { tunnelId: tunnel.id, results: transformedResults }
      } catch (err) {
        console.warn(`Error restoring connection status for tunnel ${tunnel.id}:`, err)
        return { tunnelId: tunnel.id, results: [] }
      }
    })

    const allResults = await Promise.allSettled(checkPromises)
    return allResults.map(result => result.status === 'fulfilled' ? result.value : null).filter(Boolean)
  }
)

// Slice
const tunnelsSlice = createSlice({
  name: 'tunnels',
  initialState,
  reducers: {
    checkTunnelHealthStatus: (state, action) => {
      const { tunnelId } = action.payload
      const tunnel = state.tunnels.find(t => t.id === tunnelId)
      if (!tunnel) {
        return
      }

      const cacheKey = tunnelId
      const cached = state.healthCheckCache[cacheKey]
      const now = Date.now()
      const cacheTimeout = 5 * 60 * 1000

      if (cached && (now - cached.timestamp) < cacheTimeout) {
        return
      }

      const isHealthy = tunnel.status === 'healthy'
      state.healthCheckCache[cacheKey] = {
        timestamp: now,
        status: {
          healthy: isHealthy,
          message: isHealthy ? 'Tunnel is healthy' : 'Tunnel is down'
        }
      }
    },
    updateSSHStatusFromResponse: (state, action) => {
      const { tunnelId, responseData } = action.payload
      if (responseData) {
        state.sshStatus[tunnelId] = {
          status: responseData.ssh_status === 'working' ? 'working' : 'failed',
          message: responseData.message || '',
          port: responseData.cloudflare_port || null
        }

        if (responseData.tunnel_status) {
          const tunnel = state.tunnels.find(t => t.id === tunnelId)
          if (tunnel) {
            tunnel.status = responseData.tunnel_status
          }
        }
      }
    },
    updateWinRMStatusFromResponse: (state, action) => {
      const { tunnelId, responseData } = action.payload
      if (responseData) {
        state.winrmStatus[tunnelId] = {
          status: responseData.winrm_status === 'working' ? 'working' : 'failed',
          message: responseData.message || '',
          port: responseData.cloudflare_port || null,
          evilWinrmCommand: responseData.evilWinrmCommand || state.winrmStatus[tunnelId]?.evilWinrmCommand || null
        }

        if (responseData.tunnel_status) {
          const tunnel = state.tunnels.find(t => t.id === tunnelId)
          if (tunnel) {
            tunnel.status = responseData.tunnel_status
          }
        }
      }
    },
    getWinRMStatus: (state, action) => {
      // This is a selector function, no state change needed
      return state.winrmStatus[action.payload] || {
        status: 'unknown',
        message: '',
        port: null
      }
    },
    getSSHStatus: (state, action) => {
      // This is a selector function, no state change needed
      return state.sshStatus[action.payload] || {
        status: 'unknown',
        message: '',
        port: null
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // loadTunnels
      .addCase(loadTunnels.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadTunnels.fulfilled, (state, action) => {
        state.loading = false
        state.tunnels = action.payload
        state.tunnelsLoaded = true
        state.loadingPromise = null
      })
      .addCase(loadTunnels.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.tunnels = []
        state.loadingPromise = null
      })
      // refreshTunnels
      .addCase(refreshTunnels.pending, (state) => {
        state.loading = true
      })
      .addCase(refreshTunnels.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(refreshTunnels.rejected, (state) => {
        state.loading = false
      })
      // testWinRM
      .addCase(testWinRM.fulfilled, (state, action) => {
        const { tunnelId, data } = action.payload
        state.winrmStatus[tunnelId] = {
          status: data.winrm_status === 'working' ? 'working' : 'failed',
          message: data.message || '',
          port: data.cloudflare_port || null
        }

        if (data.tunnel_status) {
          const tunnel = state.tunnels.find(t => t.id === tunnelId)
          if (tunnel) {
            tunnel.status = data.tunnel_status
          }
        }
      })
      .addCase(testWinRM.rejected, (state, action) => {
        const { tunnelId, error } = action.payload
        state.winrmStatus[tunnelId] = {
          status: 'error',
          message: error || 'Error testing WinRM',
          port: null
        }
      })
      // testSSH
      .addCase(testSSH.fulfilled, (state, action) => {
        const { tunnelId, data } = action.payload
        state.sshStatus[tunnelId] = {
          status: data.ssh_status === 'working' ? 'working' : 'failed',
          message: data.message || '',
          port: data.cloudflare_port || null
        }

        if (data.tunnel_status) {
          const tunnel = state.tunnels.find(t => t.id === tunnelId)
          if (tunnel) {
            tunnel.status = data.tunnel_status
          }
        }
      })
      .addCase(testSSH.rejected, (state, action) => {
        const { tunnelId, error } = action.payload
        state.sshStatus[tunnelId] = {
          status: 'error',
          message: error || 'Error testing SSH',
          port: null
        }
      })
      // updateTunnelLabel
      .addCase(updateTunnelLabel.fulfilled, (state, action) => {
        const { tunnelId, label } = action.payload
        const tunnel = state.tunnels.find(t => t.id === tunnelId)
        if (tunnel) {
          tunnel.label = label
        }
      })
      // disconnectConnection
      .addCase(disconnectConnection.fulfilled, (state, action) => {
        const { tunnelId, connectionType } = action.payload
        if (connectionType === 'ssh') {
          state.sshStatus[tunnelId] = {
            status: 'unknown',
            message: '',
            port: null
          }
        } else if (connectionType === 'winrm') {
          state.winrmStatus[tunnelId] = {
            status: 'unknown',
            message: '',
            port: null,
            evilWinrmCommand: null
          }
        }
      })
      // restoreConnectionStatus
      .addCase(restoreConnectionStatus.pending, (state) => {
        state.restoringConnections = true
      })
      .addCase(restoreConnectionStatus.fulfilled, (state, action) => {
        state.restoringConnections = false
        if (action.payload) {
          action.payload.forEach(({ tunnelId, results }) => {
            if (results && Array.isArray(results)) {
              results.forEach((result) => {
                if (result.status === 'fulfilled' && result.value) {
                  const { type, data } = result.value
                  if (type === 'ssh' && data) {
                    if (data.session_exists && data.active) {
                      state.sshStatus[tunnelId] = {
                        status: 'working',
                        message: 'SSH session active',
                        port: data.cloudflare_port || null
                      }
                    } else {
                      // No active session - set to unknown but preserve existing status if better
                      if (!state.sshStatus[tunnelId] || state.sshStatus[tunnelId].status === 'unknown') {
                        state.sshStatus[tunnelId] = {
                          status: 'unknown',
                          message: data?.message || '',
                          port: null
                        }
                      }
                    }
                  } else if (type === 'winrm' && data) {
                    if (data.winrm_status === 'working') {
                      state.winrmStatus[tunnelId] = {
                        status: 'working',
                        message: data.message || '',
                        port: data.cloudflare_port || null
                      }
                    } else {
                      // WinRM not working - set to failed or unknown
                      state.winrmStatus[tunnelId] = {
                        status: data.winrm_status === 'failed' ? 'failed' : 'unknown',
                        message: data.message || '',
                        port: null
                      }
                    }
                  }
                } else if (result.status === 'rejected') {
                  // API call failed - don't update status, keep existing
                  console.warn(`Failed to check connection for tunnel ${tunnelId}:`, result.reason)
                }
              })
            }
          })
        }
      })
      .addCase(restoreConnectionStatus.rejected, (state) => {
        state.restoringConnections = false
      })
  }
})

// Selectors
export const selectHealthyTunnels = (state) => {
  return state.tunnels.tunnels.filter(t => t.status === 'healthy')
}

export const selectTunnelById = (state, tunnelId) => {
  return state.tunnels.tunnels.find(t => t.id === tunnelId)
}

export const selectWinRMStatus = (state, tunnelId) => {
  return state.tunnels.winrmStatus[tunnelId] || {
    status: 'unknown',
    message: '',
    port: null
  }
}

export const selectSSHStatus = (state, tunnelId) => {
  return state.tunnels.sshStatus[tunnelId] || {
    status: 'unknown',
    message: '',
    port: null
  }
}

export const { 
  checkTunnelHealthStatus,
  updateSSHStatusFromResponse,
  updateWinRMStatusFromResponse,
  getWinRMStatus,
  getSSHStatus
} = tunnelsSlice.actions

export default tunnelsSlice.reducer

