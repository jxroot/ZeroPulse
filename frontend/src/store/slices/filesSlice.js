import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

export const loadDirectory = createAsyncThunk(
  'files/loadDirectory',
  async ({ tunnelId, path }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/files/list/${tunnelId}`, {
        params: { path: path || 'C:\\' }
      })

      if (response.data.success) {
        return {
          items: response.data.items || [],
          path: response.data.path
        }
      }
      return rejectWithValue('Failed to load directory')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load directory')
    }
  }
)

export const downloadFile = createAsyncThunk(
  'files/downloadFile',
  async ({ tunnelId, filePath }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/files/download/${tunnelId}`, {
        params: { file_path: filePath },
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filePath.split('\\').pop())
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      return { success: true }
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to download file')
    }
  }
)

export const uploadFile = createAsyncThunk(
  'files/uploadFile',
  async ({ tunnelId, filePath, file }, { rejectWithValue, dispatch }) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('file_path', filePath)

      const response = await api.post(`/files/upload/${tunnelId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (response.data.success) {
        await dispatch(loadDirectory({ tunnelId, path: filePath }))
        return response.data
      }
      return rejectWithValue('Failed to upload file')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to upload file')
    }
  }
)

const initialState = {
  currentPath: 'C:\\',
  items: [],
  loading: false,
  error: null,
  selectedItems: new Set(),
  history: [],
  historyIndex: -1
}

const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    setCurrentPath: (state, action) => {
      state.currentPath = action.payload
    },
    toggleSelection: (state, action) => {
      const itemPath = action.payload
      if (state.selectedItems.has(itemPath)) {
        state.selectedItems.delete(itemPath)
      } else {
        state.selectedItems.add(itemPath)
      }
    },
    clearSelection: (state) => {
      state.selectedItems.clear()
    },
    addToHistory: (state, action) => {
      const path = action.payload
      if (state.history.length === 0 || state.history[state.historyIndex] !== path) {
        if (state.historyIndex < state.history.length - 1) {
          state.history = state.history.slice(0, state.historyIndex + 1)
        }
        state.history.push(path)
        state.historyIndex = state.history.length - 1
      }
    },
    navigateBack: (state) => {
      if (state.historyIndex > 0) {
        state.historyIndex--
      }
    },
    navigateForward: (state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++
      }
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadDirectory.pending, (state) => {
        state.loading = true
        state.error = null
        state.selectedItems.clear()
      })
      .addCase(loadDirectory.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.items
        state.currentPath = action.payload.path
      })
      .addCase(loadDirectory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.items = []
      })
      .addCase(uploadFile.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(uploadFile.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(uploadFile.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  }
})

export const {
  setCurrentPath,
  toggleSelection,
  clearSelection,
  addToHistory,
  navigateBack,
  navigateForward,
  clearError
} = filesSlice.actions

export default filesSlice.reducer

