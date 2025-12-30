import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

export const loadModules = createAsyncThunk(
  'settings/loadModules',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/settings/modules')
      return response.data.modules || []
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load modules')
    }
  }
)

export const loadDependencies = createAsyncThunk(
  'settings/loadDependencies',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/settings/dependencies')
      return response.data.dependencies || []
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load dependencies')
    }
  }
)

export const createModule = createAsyncThunk(
  'settings/createModule',
  async (moduleData, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post('/settings/modules', moduleData)
      await dispatch(loadModules())
      return response.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to create module')
    }
  }
)

export const updateModule = createAsyncThunk(
  'settings/updateModule',
  async ({ moduleId, moduleData }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.put(`/settings/modules/${moduleId}`, moduleData)
      await dispatch(loadModules())
      return response.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update module')
    }
  }
)

export const deleteModule = createAsyncThunk(
  'settings/deleteModule',
  async (moduleId, { dispatch, rejectWithValue }) => {
    try {
      await api.delete(`/settings/modules/${moduleId}`)
      await dispatch(loadModules())
      return moduleId
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to delete module')
    }
  }
)

export const executeModule = createAsyncThunk(
  'settings/executeModule',
  async ({ moduleId, tunnelId, script }, { rejectWithValue }) => {
    try {
      const payload = { tunnel_id: tunnelId }
      if (script) {
        payload.script = script
        payload.use_powershell = true
      }
      const response = await api.post(`/settings/modules/${moduleId}/execute`, payload)
      return response.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to execute module')
    }
  }
)

const initialState = {
  activeTab: 'modules',
  modules: [],
  dependencies: [],
  loading: false,
  modulesLoaded: false, // Flag to track if modules have been loaded at least once
  modulesError: null,
  dependenciesError: null
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setActiveTab: (state, action) => {
      state.activeTab = action.payload
    },
    clearModulesError: (state) => {
      state.modulesError = null
    },
    clearDependenciesError: (state) => {
      state.dependenciesError = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadModules.pending, (state) => {
        state.loading = true
        state.modulesError = null
      })
      .addCase(loadModules.fulfilled, (state, action) => {
        state.loading = false
        state.modules = action.payload
        state.modulesLoaded = true
      })
      .addCase(loadModules.rejected, (state, action) => {
        state.loading = false
        state.modulesError = action.payload
        state.modules = []
        state.modulesLoaded = true // Set to true even on error to prevent infinite loop
      })
      .addCase(loadDependencies.pending, (state) => {
        state.loading = true
        state.dependenciesError = null
      })
      .addCase(loadDependencies.fulfilled, (state, action) => {
        state.loading = false
        state.dependencies = action.payload
      })
      .addCase(loadDependencies.rejected, (state, action) => {
        state.loading = false
        state.dependenciesError = action.payload
        state.dependencies = []
      })
      .addCase(createModule.pending, (state) => {
        state.loading = true
        state.modulesError = null
      })
      .addCase(createModule.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(createModule.rejected, (state, action) => {
        state.loading = false
        state.modulesError = action.payload
      })
      .addCase(updateModule.pending, (state) => {
        state.loading = true
        state.modulesError = null
      })
      .addCase(updateModule.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(updateModule.rejected, (state, action) => {
        state.loading = false
        state.modulesError = action.payload
      })
      .addCase(deleteModule.pending, (state) => {
        state.loading = true
        state.modulesError = null
      })
      .addCase(deleteModule.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(deleteModule.rejected, (state, action) => {
        state.loading = false
        state.modulesError = action.payload
      })
      .addCase(executeModule.pending, (state) => {
        state.loading = true
        state.modulesError = null
      })
      .addCase(executeModule.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(executeModule.rejected, (state, action) => {
        state.loading = false
        state.modulesError = action.payload
      })
  }
})

export const {
  setActiveTab,
  clearModulesError,
  clearDependenciesError
} = settingsSlice.actions

export default settingsSlice.reducer

