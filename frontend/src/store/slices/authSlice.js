import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

// Initial state
const initialState = {
  token: localStorage.getItem('auth_token') || null,
  isAuthenticated: false, // Will be set to true after checkAuth succeeds
  loading: false,
  error: null,
  initialized: false, // Track if auth check has been completed
  permissions: [], // User permissions
  user: null // Current user information
}

// Async thunks
export const checkAuth = createAsyncThunk(
  'auth/checkAuth',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      await api.get('/auth/verify')
      // Fetch user info after successful verification
      await dispatch(fetchUserInfo())
      return true
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Authentication failed')
    }
  }
)

export const fetchUserInfo = createAsyncThunk(
  'auth/fetchUserInfo',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/users/me')
      if (response.data.success && response.data.user) {
        return response.data.user
      }
      return rejectWithValue('Failed to fetch user info')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch user info')
    }
  }
)

export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password }, { rejectWithValue, dispatch }) => {
    try {
      const response = await api.post('/auth/login', {
        username,
        password
      })

      if (response.data.access_token) {
        localStorage.setItem('auth_token', response.data.access_token)
        // Fetch user info after successful login
        await dispatch(fetchUserInfo())
        return response.data.access_token
      }

      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Login failed')
    }
  }
)

// loadPermissions removed - single user system doesn't need permissions
export const updateCurrentUser = createAsyncThunk(
  'auth/updateCurrentUser',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await api.put('/users/me', userData)
      return response.data.user || userData
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to update user')
    }
  }
)

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.token = null
      state.isAuthenticated = false
      state.initialized = true
      state.permissions = []
      state.user = null
      localStorage.removeItem('auth_token')
    },
    clearError: (state) => {
      state.error = null
    },
    setInitialized: (state) => {
      state.initialized = true
    }
  },
  extraReducers: (builder) => {
    builder
      // checkAuth
      .addCase(checkAuth.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.loading = false
        state.isAuthenticated = true
        state.initialized = true
        // Ensure token is set from localStorage
        if (!state.token) {
          state.token = localStorage.getItem('auth_token')
        }
        // Permissions will be loaded by components after auth is verified
      })
      .addCase(checkAuth.rejected, (state, action) => {
        state.loading = false
        state.isAuthenticated = false
        state.token = null
        state.user = null
        state.permissions = []
        state.initialized = true
        localStorage.removeItem('auth_token')
      })
      // login
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.token = action.payload
        state.isAuthenticated = true
        state.error = null
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.isAuthenticated = false
      })
      // fetchUserInfo
      .addCase(fetchUserInfo.fulfilled, (state, action) => {
        state.user = action.payload
      })
      .addCase(fetchUserInfo.rejected, (state) => {
        state.user = null
      })
      // updateCurrentUser
      .addCase(updateCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload
      })
  }
})

export const { logout, clearError } = authSlice.actions
export default authSlice.reducer

