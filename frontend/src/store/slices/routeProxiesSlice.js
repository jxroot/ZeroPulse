import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

export const loadRouteProxies = createAsyncThunk(
  'routeProxies/loadRouteProxies',
  async (tunnelId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/commands/route-proxies/${tunnelId}`)
      if (response.data.success) {
        return { tunnelId, proxies: response.data.proxies || [] }
      }
      return rejectWithValue('Failed to load route proxies')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load route proxies')
    }
  }
)

export const loadAllRouteProxies = createAsyncThunk(
  'routeProxies/loadAllRouteProxies',
  async (_, { getState, rejectWithValue }) => {
    const state = getState()
    const tunnels = state.tunnels.tunnels
    
    try {
      const promises = tunnels.map(tunnel =>
        api.get(`/commands/route-proxies/${tunnel.id}`)
          .then(response => ({
            tunnelId: tunnel.id,
            proxies: response.data.proxies || []
          }))
          .catch(() => ({
            tunnelId: tunnel.id,
            proxies: []
          }))
      )

      const results = await Promise.allSettled(promises)
      const allProxies = {}
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          allProxies[result.value.tunnelId] = result.value.proxies
        }
      })

      return allProxies
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load route proxies')
    }
  }
)

export const startRouteProxy = createAsyncThunk(
  'routeProxies/startRouteProxy',
  async ({ hostname, targetPort, localPort, routeType, tunnelId }, { dispatch, getState, rejectWithValue }) => {
    try {
      const response = await api.post('/commands/start-route-proxy', {
        hostname,
        target_port: targetPort,
        local_port: localPort,
        route_type: routeType || 'tcp'
      })
      if (response.data.success) {
        // Refresh proxies for the specific tunnel if provided, otherwise refresh all loaded tunnels
        if (tunnelId) {
          await dispatch(loadRouteProxies(tunnelId))
        } else {
          // Find tunnelId from state by searching allProxies
          const state = getState()
          const allProxies = state.routeProxies.allProxies || {}
          for (const [tid, proxies] of Object.entries(allProxies)) {
            if (proxies.some(p => p.hostname === hostname && p.target_port === targetPort)) {
              await dispatch(loadRouteProxies(tid))
              break
            }
          }
        }
        return response.data
      }
      return rejectWithValue(response.data.message || 'Failed to start route proxy')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to start route proxy')
    }
  }
)

export const stopRouteProxy = createAsyncThunk(
  'routeProxies/stopRouteProxy',
  async ({ hostname, targetPort, localPort, tunnelId }, { dispatch, getState, rejectWithValue }) => {
    try {
      const response = await api.post('/commands/stop-route-proxy', {
        hostname,
        target_port: targetPort,
        local_port: localPort
      })
      if (response.data.success) {
        // Refresh proxies for the specific tunnel if provided, otherwise refresh all loaded tunnels
        if (tunnelId) {
          await dispatch(loadRouteProxies(tunnelId))
        } else {
          // Find tunnelId from state by searching allProxies
          const state = getState()
          const allProxies = state.routeProxies.allProxies || {}
          for (const [tid, proxies] of Object.entries(allProxies)) {
            if (proxies.some(p => p.hostname === hostname && p.target_port === targetPort)) {
              await dispatch(loadRouteProxies(tid))
              break
            }
          }
        }
        return response.data
      }
      return rejectWithValue(response.data.message || 'Failed to stop route proxy')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to stop route proxy')
    }
  }
)

export const killAllRouteProxies = createAsyncThunk(
  'routeProxies/killAllRouteProxies',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post('/commands/kill-all-route-proxies')
      if (response.data.success) {
        // Refresh proxies
        await dispatch(loadAllRouteProxies())
        return response.data
      }
      return rejectWithValue(response.data.message || 'Failed to kill all route proxies')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to kill all route proxies')
    }
  }
)

const initialState = {
  proxies: [],
  allProxies: {},
  loading: false,
  error: null,
  routeProxiesLoaded: false,
  proxyOperations: {}
}

const routeProxiesSlice = createSlice({
  name: 'routeProxies',
  initialState,
  reducers: {
    setProxyOperation: (state, action) => {
      const { proxyKey, operation } = action.payload
      state.proxyOperations[proxyKey] = operation
    },
    clearProxyOperation: (state, action) => {
      delete state.proxyOperations[action.payload]
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadRouteProxies.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadRouteProxies.fulfilled, (state, action) => {
        state.loading = false
        state.proxies = action.payload.proxies
        // Also store in allProxies for the specific tunnel
        if (!state.allProxies) {
          state.allProxies = {}
        }
        state.allProxies[action.payload.tunnelId] = action.payload.proxies
      })
      .addCase(loadRouteProxies.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.proxies = []
      })
      .addCase(loadAllRouteProxies.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadAllRouteProxies.fulfilled, (state, action) => {
        state.loading = false
        state.allProxies = action.payload
        state.routeProxiesLoaded = true
      })
      .addCase(loadAllRouteProxies.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // startRouteProxy
      .addCase(startRouteProxy.pending, (state, action) => {
        const { hostname, targetPort } = action.meta.arg
        const key = `${hostname}:${targetPort}`
        state.proxyOperations[key] = 'starting'
        state.loading = true
      })
      .addCase(startRouteProxy.fulfilled, (state, action) => {
        const { hostname, targetPort } = action.meta.arg
        const key = `${hostname}:${targetPort}`
        delete state.proxyOperations[key]
        state.loading = false
      })
      .addCase(startRouteProxy.rejected, (state, action) => {
        const { hostname, targetPort } = action.meta.arg
        const key = `${hostname}:${targetPort}`
        delete state.proxyOperations[key]
        state.loading = false
        state.error = action.payload
      })
      // stopRouteProxy
      .addCase(stopRouteProxy.pending, (state, action) => {
        const { hostname, targetPort } = action.meta.arg
        const key = `${hostname}:${targetPort}`
        state.proxyOperations[key] = 'stopping'
        state.loading = true
      })
      .addCase(stopRouteProxy.fulfilled, (state, action) => {
        const { hostname, targetPort } = action.meta.arg
        const key = `${hostname}:${targetPort}`
        delete state.proxyOperations[key]
        state.loading = false
      })
      .addCase(stopRouteProxy.rejected, (state, action) => {
        const { hostname, targetPort } = action.meta.arg
        const key = `${hostname}:${targetPort}`
        delete state.proxyOperations[key]
        state.loading = false
        state.error = action.payload
      })
      // killAllRouteProxies
      .addCase(killAllRouteProxies.pending, (state) => {
        state.loading = true
      })
      .addCase(killAllRouteProxies.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(killAllRouteProxies.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  }
})

export const {
  setProxyOperation,
  clearProxyOperation,
  clearError
} = routeProxiesSlice.actions

// Helper selectors
export const isProxyStarting = (state, hostname, targetPort) => {
  const key = `${hostname}:${targetPort}`
  return state.routeProxies.proxyOperations[key] === 'starting'
}

export const isProxyStopping = (state, hostname, targetPort) => {
  const key = `${hostname}:${targetPort}`
  return state.routeProxies.proxyOperations[key] === 'stopping'
}

export default routeProxiesSlice.reducer

