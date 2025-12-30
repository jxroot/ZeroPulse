import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

export const loadRoutes = createAsyncThunk(
  'routes/loadRoutes',
  async (tunnelId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/tunnels/${tunnelId}/routes`)
      if (response.data.success) {
        return response.data
      }
      return rejectWithValue('Failed to load routes')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load routes')
    }
  }
)

export const saveRoutes = createAsyncThunk(
  'routes/saveRoutes',
  async ({ tunnelId, routes, defaultHostname, winrmUsername, winrmPassword, winrmNtlmHash, sshHostname, sshUsername, sshPassword }, { dispatch, rejectWithValue }) => {
    try {
      // Filter out empty routes and ensure catch-all is at the end
      let validRoutes = routes.filter(route => {
        if (route.service === 'http_status:404') return true // Keep catch-all
        
        // For TCP and SSH, hostname is required
        const isTCP = route.type === 'TCP' || route.service?.startsWith('tcp://')
        const isSSH = route.type === 'SSH' || route.service?.startsWith('ssh://')
        
        if (isTCP || isSSH) {
          // TCP and SSH require hostname, type, and service
        return route.hostname && route.type && route.service
        }
        
        // For other types (HTTP, HTTPS), hostname is optional but type and service are required
        return route.type && route.service
      })
      
      // Ensure catch-all is at the end
      const catchAllIndex = validRoutes.findIndex(r => r.service === 'http_status:404')
      if (catchAllIndex !== -1 && catchAllIndex !== validRoutes.length - 1) {
        const catchAll = validRoutes.splice(catchAllIndex, 1)[0]
        validRoutes.push(catchAll)
      }
      
      // If no catch-all, add one
      if (validRoutes.length === 0 || validRoutes[validRoutes.length - 1].service !== 'http_status:404') {
        validRoutes.push({ service: 'http_status:404' })
      }

      const response = await api.put(`/tunnels/${tunnelId}/routes`, {
        ingress: validRoutes,
        default_hostname: defaultHostname,
        winrm_username: winrmUsername,
        winrm_password: winrmPassword,
        winrm_ntlm_hash: winrmNtlmHash,
        ssh_hostname: sshHostname,
        ssh_username: sshUsername,
        ssh_password: sshPassword
      })

      if (response.data.success) {
        // Reload routes to get updated data
        await dispatch(loadRoutes(tunnelId))
        return {
          success: true,
          message: 'Routes and default hostname updated successfully!',
          dnsRecords: response.data.dns_records || []
        }
      }
      return rejectWithValue(response.data.message || 'Failed to save routes')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to save routes')
    }
  }
)

const initialState = {
  isModalOpen: false,
  currentTunnelId: null,
  activeTab: 'routes',
  routes: [],
  defaultHostname: '',
  winrmUsername: '',
  winrmPassword: '',
  winrmNtlmHash: '',
  sshHostname: '',
  sshUsername: '',
  sshPassword: '',
  domain: '', // Cloudflare domain for validation
  loading: false,
  error: null,
  result: null,
  routeProxiesLoaded: false,
  dnsRecords: []
}

const routesSlice = createSlice({
  name: 'routes',
  initialState,
  reducers: {
    openModal: (state, action) => {
      const { tunnelId, tab = 'routes' } = action.payload
      state.currentTunnelId = tunnelId
      state.activeTab = tab
      state.routes = []
      state.defaultHostname = ''
      state.winrmUsername = ''
      state.winrmPassword = ''
      state.winrmNtlmHash = ''
      state.sshHostname = ''
      state.sshUsername = ''
      state.sshPassword = ''
      state.error = null
      state.result = null
      state.routeProxiesLoaded = false
      state.dnsRecords = []
      state.isModalOpen = true
    },
    closeModal: (state) => {
      state.isModalOpen = false
      state.currentTunnelId = null
      state.routes = []
      state.error = null
      state.result = null
    },
    setActiveTab: (state, action) => {
      state.activeTab = action.payload
    },
    setDefaultHostname: (state, action) => {
      state.defaultHostname = action.payload
    },
    setSSHHostname: (state, action) => {
      state.sshHostname = action.payload
    },
    addRoute: (state, action) => {
      state.routes.push(action.payload)
    },
    removeRoute: (state, action) => {
      state.routes = state.routes.filter((_, index) => index !== action.payload)
    },
    setResult: (state, action) => {
      state.result = action.payload
    },
    setDNSRecords: (state, action) => {
      state.dnsRecords = action.payload
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadRoutes.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadRoutes.fulfilled, (state, action) => {
        state.loading = false
        const ingress = action.payload.ingress || []
        const catchAllIndex = ingress.findIndex(r => r.service === 'http_status:404')
        if (catchAllIndex !== -1 && catchAllIndex !== ingress.length - 1) {
          const catchAll = ingress.splice(catchAllIndex, 1)[0]
          ingress.push(catchAll)
        }
        state.routes = ingress
        state.defaultHostname = action.payload.default_hostname || ''
        state.winrmUsername = action.payload.winrm_username || ''
        state.winrmPassword = action.payload.winrm_password || ''
        state.winrmNtlmHash = action.payload.winrm_ntlm_hash || ''
        state.sshHostname = action.payload.ssh_hostname || ''
        state.sshUsername = action.payload.ssh_username || ''
        state.sshPassword = action.payload.ssh_password || ''
        state.domain = action.payload.domain || ''
      })
      .addCase(loadRoutes.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // saveRoutes
      .addCase(saveRoutes.pending, (state) => {
        state.loading = true
        state.error = null
        state.result = null
        state.dnsRecords = []
      })
      .addCase(saveRoutes.fulfilled, (state, action) => {
        state.loading = false
        state.result = {
          success: true,
          message: action.payload.message
        }
        state.dnsRecords = action.payload.dnsRecords || []
      })
      .addCase(saveRoutes.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.result = {
          success: false,
          message: action.payload
        }
      })
  }
})

export const {
  openModal,
  closeModal,
  setActiveTab,
  setDefaultHostname,
  setSSHHostname,
  addRoute,
  removeRoute,
  setResult,
  setDNSRecords,
  clearError
} = routesSlice.actions

export default routesSlice.reducer

