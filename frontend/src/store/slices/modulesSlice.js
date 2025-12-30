import { createSlice } from '@reduxjs/toolkit'

// Initial state
const initialState = {
  isModalOpen: false,
  currentTunnelId: null,
  activeCategory: 'system',
  commandOutput: [],
  shellOutput: [],
  shellInput: '',
  loading: false,
  error: null,
  processTarget: '',
  networkTarget: '',
  registryPath: '',
  registryValue: '',
  registryData: '',
  vncVisible: false,
  vncViewOnly: false,
  initialCommand: null
}

// Slice
const modulesSlice = createSlice({
  name: 'modules',
  initialState,
  reducers: {
    openModal: (state, action) => {
      state.currentTunnelId = action.payload.tunnelId || action.payload
      state.initialCommand = action.payload.command || null
      state.commandOutput = []
      state.shellOutput = []
      state.shellInput = ''
      state.error = null
      state.isModalOpen = true
    },
    closeModal: (state) => {
      state.isModalOpen = false
      state.currentTunnelId = null
      state.activeCategory = 'system'
      state.commandOutput = []
      state.shellOutput = []
      state.shellInput = ''
      state.error = null
      state.vncVisible = false
      state.initialCommand = null
    },
    showCategory: (state, action) => {
      state.activeCategory = action.payload
    },
    appendOutput: (state, action) => {
      const { text, type = 'info' } = action.payload
      const timestamp = new Date().toLocaleTimeString()
      state.commandOutput.push({
        text,
        type,
        timestamp
      })
    },
    appendShellOutput: (state, action) => {
      const { text, type = 'output' } = action.payload
      state.shellOutput.push({
        text,
        type,
        timestamp: new Date().toLocaleTimeString()
      })
    },
    clearOutput: (state) => {
      state.commandOutput = []
    },
    clearShellOutput: (state) => {
      state.shellOutput = []
    },
    setShellInput: (state, action) => {
      state.shellInput = action.payload
    },
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
    },
    setProcessTarget: (state, action) => {
      state.processTarget = action.payload
    },
    setNetworkTarget: (state, action) => {
      state.networkTarget = action.payload
    },
    setRegistryPath: (state, action) => {
      state.registryPath = action.payload
    },
    setRegistryValue: (state, action) => {
      state.registryValue = action.payload
    },
    setRegistryData: (state, action) => {
      state.registryData = action.payload
    },
    showVNC: (state, action) => {
      state.vncVisible = true
      state.vncViewOnly = action.payload || false
    },
    hideVNC: (state) => {
      state.vncVisible = false
    }
  }
})

export const {
  openModal,
  closeModal,
  showCategory,
  appendOutput,
  appendShellOutput,
  clearOutput,
  clearShellOutput,
  setShellInput,
  setLoading,
  setError,
  setProcessTarget,
  setNetworkTarget,
  setRegistryPath,
  setRegistryValue,
  setRegistryData,
  showVNC,
  hideVNC
} = modulesSlice.actions

export default modulesSlice.reducer

