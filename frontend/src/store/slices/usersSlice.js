import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

// Async Thunks
export const loadUsers = createAsyncThunk(
  'users/loadUsers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/users')
      return response.data.users || []
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to load users')
    }
  }
)

export const loadRoles = createAsyncThunk(
  'users/loadRoles',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/users/roles')
      const roles = response.data.roles || []
      console.log('Loaded roles from API:', roles.length, roles)
      
      // Roles should already have permissions from the API
      // But if not, load them individually
      const rolesWithPerms = await Promise.all(
        roles.map(async (role) => {
          // If role already has permissions, use it
          if (role.permissions && role.permissions.length > 0) {
            console.log(`Role ${role.name} already has ${role.permissions.length} permissions`)
            return role
          }
          
          // Otherwise, load permissions for this role
          try {
            const roleResponse = await api.get(`/users/roles/${role.id}`)
            const roleData = roleResponse.data.role || role
            console.log(`Role ${role.name} loaded with ${roleData.permissions?.length || 0} permissions`)
            return roleData
          } catch (err) {
            console.warn(`Error loading permissions for role ${role.name}:`, err)
            // Return role with empty permissions array
            return { ...role, permissions: [] }
          }
        })
      )
      console.log('Roles with permissions:', rolesWithPerms)
      return rolesWithPerms
    } catch (error) {
      console.error('Error loading roles:', error)
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to load roles')
    }
  }
)

export const loadPermissions = createAsyncThunk(
  'users/loadPermissions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/users/permissions')
      const permissions = response.data.permissions || []
      console.log('Loaded permissions from API:', permissions.length, permissions)
      return permissions
    } catch (error) {
      console.error('Error loading permissions:', error)
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to load permissions')
    }
  }
)

export const loadMyPermissions = createAsyncThunk(
  'users/loadMyPermissions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/users/me/permissions')
      return response.data.permissions || []
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to load permissions')
    }
  }
)

export const createUser = createAsyncThunk(
  'users/createUser',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await api.post('/users', userData)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to create user')
    }
  }
)

export const updateUser = createAsyncThunk(
  'users/updateUser',
  async ({ userId, userData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/users/${userId}`, userData)
      return { userId, ...response.data }
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to update user')
    }
  }
)

export const deleteUser = createAsyncThunk(
  'users/deleteUser',
  async (userId, { rejectWithValue }) => {
    try {
      await api.delete(`/users/${userId}`)
      return userId
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to delete user')
    }
  }
)

export const createRole = createAsyncThunk(
  'users/createRole',
  async (roleData, { rejectWithValue }) => {
    try {
      const response = await api.post('/users/roles', roleData)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to create role')
    }
  }
)

export const updateRole = createAsyncThunk(
  'users/updateRole',
  async ({ roleId, roleData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/users/roles/${roleId}`, roleData)
      return { roleId, ...response.data }
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to update role')
    }
  }
)

export const deleteRole = createAsyncThunk(
  'users/deleteRole',
  async (roleId, { rejectWithValue }) => {
    try {
      await api.delete(`/users/roles/${roleId}`)
      return roleId
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || error.message || 'Failed to delete role')
    }
  }
)

const initialState = {
  users: [],
  roles: [],
  permissions: [],
  myPermissions: [],
  loading: false,
  error: null,
  usersLoaded: false,
  rolesLoaded: false,
  permissionsLoaded: false,
  // Modal states
  showUserModal: false,
  showRoleModal: false,
  editingUser: null,
  editingRole: null,
  // Form data
  userForm: {
    username: '',
    password: '',
    email: '',
    full_name: '',
    role_id: '',
    is_active: true
  },
  roleForm: {
    name: '',
    description: '',
    permission_ids: []
  }
}

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setShowUserModal: (state, action) => {
      state.showUserModal = action.payload
    },
    setShowRoleModal: (state, action) => {
      state.showRoleModal = action.payload
    },
    setEditingUser: (state, action) => {
      state.editingUser = action.payload
      if (action.payload) {
        state.userForm = {
          username: action.payload.username || '',
          password: '',
          email: action.payload.email || '',
          full_name: action.payload.full_name || '',
          role_id: action.payload.role_id || '',
          is_active: action.payload.is_active !== undefined ? action.payload.is_active : true
        }
      } else {
        state.userForm = initialState.userForm
      }
    },
    setEditingRole: (state, action) => {
      state.editingRole = action.payload
      if (action.payload) {
        state.roleForm = {
          name: action.payload.name || '',
          description: action.payload.description || '',
          permission_ids: action.payload.permissions?.map(p => p.id) || []
        }
      } else {
        state.roleForm = initialState.roleForm
      }
    },
    updateUserForm: (state, action) => {
      state.userForm = { ...state.userForm, ...action.payload }
    },
    updateRoleForm: (state, action) => {
      state.roleForm = { ...state.roleForm, ...action.payload }
    },
    resetUserForm: (state) => {
      state.userForm = initialState.userForm
      state.editingUser = null
    },
    resetRoleForm: (state) => {
      state.roleForm = initialState.roleForm
      state.editingRole = null
    },
    clearError: (state) => {
      state.error = null
    },
    setRolesLoaded: (state, action) => {
      state.rolesLoaded = action.payload
    }
  },
  extraReducers: (builder) => {
    builder
      // Load Users
      .addCase(loadUsers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadUsers.fulfilled, (state, action) => {
        state.loading = false
        state.users = action.payload
        state.usersLoaded = true
      })
      .addCase(loadUsers.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Load Roles
      .addCase(loadRoles.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadRoles.fulfilled, (state, action) => {
        state.loading = false
        state.roles = action.payload
        state.rolesLoaded = true
      })
      .addCase(loadRoles.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        // Don't set rolesLoaded to true on error, but also don't block UI
        console.error('loadRoles rejected:', action.payload)
      })
      // Load Permissions
      .addCase(loadPermissions.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadPermissions.fulfilled, (state, action) => {
        state.loading = false
        state.permissions = action.payload
        state.permissionsLoaded = true
      })
      .addCase(loadPermissions.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Load My Permissions
      .addCase(loadMyPermissions.fulfilled, (state, action) => {
        state.myPermissions = action.payload
      })
      // Create User
      .addCase(createUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createUser.fulfilled, (state) => {
        state.loading = false
        state.showUserModal = false
        state.userForm = initialState.userForm
      })
      .addCase(createUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update User
      .addCase(updateUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateUser.fulfilled, (state) => {
        state.loading = false
        state.showUserModal = false
        state.editingUser = null
        state.userForm = initialState.userForm
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete User
      .addCase(deleteUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.loading = false
        state.users = state.users.filter(u => u.id !== action.payload)
      })
      .addCase(deleteUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create Role
      .addCase(createRole.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createRole.fulfilled, (state) => {
        state.loading = false
        state.showRoleModal = false
        state.roleForm = initialState.roleForm
      })
      .addCase(createRole.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update Role
      .addCase(updateRole.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateRole.fulfilled, (state, action, dispatch) => {
        state.loading = false
        state.showRoleModal = false
        state.editingRole = null
        state.roleForm = initialState.roleForm
        state.rolesLoaded = false // Force reload roles
        // Note: We can't dispatch here, so we'll reload in the component
      })
      .addCase(updateRole.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete Role
      .addCase(deleteRole.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteRole.fulfilled, (state, action) => {
        state.loading = false
        state.roles = state.roles.filter(r => r.id !== action.payload)
      })
      .addCase(deleteRole.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  }
})

export const {
  setShowUserModal,
  setShowRoleModal,
  setEditingUser,
  setEditingRole,
  updateUserForm,
  updateRoleForm,
  resetUserForm,
  resetRoleForm,
  clearError,
  setRolesLoaded
} = usersSlice.actions

export default usersSlice.reducer

