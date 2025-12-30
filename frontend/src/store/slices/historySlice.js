import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

// Async thunks
export const loadCommands = createAsyncThunk(
  'history/loadCommands',
  async (force = false, { getState, rejectWithValue, dispatch }) => {
    const state = getState().history
    
    if (state.historyLoaded && !force) {
      return {
        commands: state.commands,
        total: state.total || 0,
        stats: state.stats
      }
    }

    try {
      const params = {
        limit: state.filters.limit,
        offset: state.filters.offset
      }

      if (state.filters.tunnelId) {
        params.tunnel_id = state.filters.tunnelId
      }

      if (state.filters.search) {
        params.search = state.filters.search
      }

      if (state.filters.successOnly !== null) {
        params.success_only = state.filters.successOnly
      }

      const response = await api.get('/history/commands', { params })
      
      if (response.data.success) {
        return {
          commands: response.data.commands || [],
          total: response.data.total || 0,
          stats: response.data.stats || {}
        }
      }
      
      return rejectWithValue('Failed to load command history')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load command history')
    }
  }
)

export const deleteCommand = createAsyncThunk(
  'history/deleteCommand',
  async (commandId, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.delete(`/history/commands/${commandId}`)
      if (response.data.success) {
        dispatch(loadCommands(true)) // Force reload
        return commandId
      }
      return rejectWithValue('Failed to delete command')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to delete command')
    }
  }
)

export const clearHistory = createAsyncThunk(
  'history/clearHistory',
  async (tunnelId = null, { dispatch, rejectWithValue }) => {
    try {
      const params = tunnelId ? { tunnel_id: tunnelId } : {}
      const response = await api.delete('/history/commands', { params })
      if (response.data.success) {
        dispatch(loadCommands(true)) // Force reload
        return response.data.deleted_count || 0
      }
      return rejectWithValue(response.data.message || 'Failed to clear history')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to clear history')
    }
  }
)

export const exportToCSV = createAsyncThunk(
  'history/exportToCSV',
  async (tunnelId = null, { rejectWithValue }) => {
    try {
      const params = tunnelId ? { tunnel_id: tunnelId } : {}
      const response = await api.get('/history/commands/export/csv', {
        params,
        responseType: 'blob'
      })
      
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `command_history_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      return true
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to export CSV')
    }
  }
)

export const exportToJSON = createAsyncThunk(
  'history/exportToJSON',
  async (tunnelId = null, { rejectWithValue }) => {
    try {
      const params = tunnelId ? { tunnel_id: tunnelId } : {}
      const response = await api.get('/history/commands/export/json', {
        params,
        responseType: 'blob'
      })
      
      const blob = new Blob([response.data], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `command_history_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      return true
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to export JSON')
    }
  }
)

const initialState = {
  commands: [],
  total: 0,
  loading: false,
  error: null,
  historyLoaded: false,
  stats: {
    total: 0,
    successful: 0,
    failed: 0,
    success_rate: 0
  },
  filters: {
    tunnelId: null,
    search: '',
    successOnly: null,
    limit: 50,
    offset: 0
  }
}

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    setFilter: (state, action) => {
      const { key, value } = action.payload
      state.filters[key] = value
    },
    resetFilters: (state) => {
      state.filters = {
        tunnelId: null,
        search: '',
        successOnly: null,
        limit: 10,
        offset: 0
      }
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCommands.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadCommands.fulfilled, (state, action) => {
        state.loading = false
        state.commands = action.payload.commands
        state.total = action.payload.total
        state.stats = action.payload.stats
        state.historyLoaded = true
      })
      .addCase(deleteCommand.pending, (state) => { state.loading = true })
      .addCase(deleteCommand.fulfilled, (state) => { state.loading = false })
      .addCase(deleteCommand.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(clearHistory.pending, (state) => { state.loading = true })
      .addCase(clearHistory.fulfilled, (state) => { state.loading = false })
      .addCase(clearHistory.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(exportToCSV.pending, (state) => { state.loading = true })
      .addCase(exportToCSV.fulfilled, (state) => { state.loading = false })
      .addCase(exportToCSV.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(exportToJSON.pending, (state) => { state.loading = true })
      .addCase(exportToJSON.fulfilled, (state) => { state.loading = false })
      .addCase(exportToJSON.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(loadCommands.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.commands = []
      })
  }
})

export const { setFilter, resetFilters, clearError } = historySlice.actions
export default historySlice.reducer

