import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

// Initial state
const initialState = {
  groups: [],
  rules: [],
  filterPattern: 'tunnel-',
  loading: false,
  error: null,
  patternLoading: false,
  patternError: null
}

// Async thunks for Groups
export const loadGroups = createAsyncThunk(
  'tunnelGroups/loadGroups',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/tunnel-groups')
      if (response.data && response.data.success) {
        return response.data.groups || []
      }
      return []
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load groups')
    }
  }
)

export const createGroup = createAsyncThunk(
  'tunnelGroups/createGroup',
  async (groupData, { rejectWithValue }) => {
    try {
      const response = await api.post('/tunnel-groups', groupData)
      if (response.data && response.data.success) {
        return response.data.group
      }
      return rejectWithValue('Failed to create group')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to create group')
    }
  }
)

export const updateGroup = createAsyncThunk(
  'tunnelGroups/updateGroup',
  async ({ groupId, groupData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/tunnel-groups/${groupId}`, groupData)
      if (response.data && response.data.success) {
        return response.data.group
      }
      return rejectWithValue('Failed to update group')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update group')
    }
  }
)

export const deleteGroup = createAsyncThunk(
  'tunnelGroups/deleteGroup',
  async (groupId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/tunnel-groups/${groupId}`)
      if (response.data && response.data.success) {
        return groupId
      }
      return rejectWithValue('Failed to delete group')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to delete group')
    }
  }
)

// Async thunks for Rules
export const loadRules = createAsyncThunk(
  'tunnelGroups/loadRules',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/tunnel-groups/rules')
      if (response.data && response.data.success) {
        return response.data.rules || []
      }
      return []
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load rules')
    }
  }
)

export const createRule = createAsyncThunk(
  'tunnelGroups/createRule',
  async (ruleData, { rejectWithValue }) => {
    try {
      const response = await api.post('/tunnel-groups/rules', ruleData)
      if (response.data && response.data.success) {
        return response.data.rule
      }
      return rejectWithValue('Failed to create rule')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to create rule')
    }
  }
)

export const updateRule = createAsyncThunk(
  'tunnelGroups/updateRule',
  async ({ ruleId, ruleData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/tunnel-groups/rules/${ruleId}`, ruleData)
      if (response.data && response.data.success) {
        return response.data.rule
      }
      return rejectWithValue('Failed to update rule')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update rule')
    }
  }
)

export const deleteRule = createAsyncThunk(
  'tunnelGroups/deleteRule',
  async (ruleId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/tunnel-groups/rules/${ruleId}`)
      if (response.data && response.data.success) {
        return ruleId
      }
      return rejectWithValue('Failed to delete rule')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to delete rule')
    }
  }
)

// Async thunks for Filter Pattern
export const loadFilterPattern = createAsyncThunk(
  'tunnelGroups/loadFilterPattern',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/tunnel-groups/settings/tunnel-pattern')
      if (response.data && response.data.success) {
        return response.data.pattern || 'tunnel-'
      }
      return 'tunnel-'
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load filter pattern')
    }
  }
)

export const updateFilterPattern = createAsyncThunk(
  'tunnelGroups/updateFilterPattern',
  async (pattern, { rejectWithValue }) => {
    try {
      const response = await api.put('/tunnel-groups/settings/tunnel-pattern', { pattern })
      if (response.data && response.data.success) {
        return response.data.pattern
      }
      return rejectWithValue('Failed to update filter pattern')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update filter pattern')
    }
  }
)

// Slice
const tunnelGroupsSlice = createSlice({
  name: 'tunnelGroups',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
      state.patternError = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Load Groups
      .addCase(loadGroups.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadGroups.fulfilled, (state, action) => {
        state.loading = false
        state.groups = action.payload
      })
      .addCase(loadGroups.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create Group
      .addCase(createGroup.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createGroup.fulfilled, (state, action) => {
        state.loading = false
        state.groups.push(action.payload)
      })
      .addCase(createGroup.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update Group
      .addCase(updateGroup.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateGroup.fulfilled, (state, action) => {
        state.loading = false
        const index = state.groups.findIndex(g => g.id === action.payload.id)
        if (index !== -1) {
          state.groups[index] = action.payload
        }
      })
      .addCase(updateGroup.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete Group
      .addCase(deleteGroup.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteGroup.fulfilled, (state, action) => {
        state.loading = false
        state.groups = state.groups.filter(g => g.id !== action.payload)
        // Also remove rules for this group
        state.rules = state.rules.filter(r => r.group_id !== action.payload)
      })
      .addCase(deleteGroup.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Load Rules
      .addCase(loadRules.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadRules.fulfilled, (state, action) => {
        state.loading = false
        state.rules = action.payload
      })
      .addCase(loadRules.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create Rule
      .addCase(createRule.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createRule.fulfilled, (state, action) => {
        state.loading = false
        state.rules.push(action.payload)
      })
      .addCase(createRule.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update Rule
      .addCase(updateRule.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateRule.fulfilled, (state, action) => {
        state.loading = false
        const index = state.rules.findIndex(r => r.id === action.payload.id)
        if (index !== -1) {
          state.rules[index] = action.payload
        }
      })
      .addCase(updateRule.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete Rule
      .addCase(deleteRule.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteRule.fulfilled, (state, action) => {
        state.loading = false
        state.rules = state.rules.filter(r => r.id !== action.payload)
      })
      .addCase(deleteRule.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Load Filter Pattern
      .addCase(loadFilterPattern.pending, (state) => {
        state.patternLoading = true
        state.patternError = null
      })
      .addCase(loadFilterPattern.fulfilled, (state, action) => {
        state.patternLoading = false
        state.filterPattern = action.payload
      })
      .addCase(loadFilterPattern.rejected, (state, action) => {
        state.patternLoading = false
        state.patternError = action.payload
      })
      // Update Filter Pattern
      .addCase(updateFilterPattern.pending, (state) => {
        state.patternLoading = true
        state.patternError = null
      })
      .addCase(updateFilterPattern.fulfilled, (state, action) => {
        state.patternLoading = false
        state.filterPattern = action.payload
      })
      .addCase(updateFilterPattern.rejected, (state, action) => {
        state.patternLoading = false
        state.patternError = action.payload
      })
  }
})

export const { clearError } = tunnelGroupsSlice.actions
export default tunnelGroupsSlice.reducer

