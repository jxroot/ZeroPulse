import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  isModalOpen: false,
  currentTunnelId: null,
  command: '',
  commandType: 'cmd',
  result: null,
  loading: false,
  error: null
}

const commandsSlice = createSlice({
  name: 'commands',
  initialState,
  reducers: {
    openModal: (state, action) => {
      state.currentTunnelId = action.payload
      state.command = ''
      state.commandType = 'cmd'
      state.result = null
      state.error = null
      state.isModalOpen = true
    },
    closeModal: (state) => {
      state.isModalOpen = false
      state.currentTunnelId = null
      state.command = ''
      state.commandType = 'cmd'
      state.result = null
      state.error = null
    },
    setCommand: (state, action) => {
      state.command = action.payload
    },
    setCommandType: (state, action) => {
      state.commandType = action.payload
    },
    setResult: (state, action) => {
      state.result = action.payload
    },
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
    }
  }
})

export const {
  openModal,
  closeModal,
  setCommand,
  setCommandType,
  setResult,
  setLoading,
  setError
} = commandsSlice.actions

export default commandsSlice.reducer

