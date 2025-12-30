import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  loadUsers,
  loadRoles,
  loadPermissions,
  createUser,
  updateUser,
  deleteUser,
  createRole,
  updateRole,
  deleteRole,
  setShowUserModal,
  setShowRoleModal,
  setEditingUser,
  setEditingRole,
  updateUserForm,
  updateRoleForm,
  resetUserForm,
  resetRoleForm,
  setRolesLoaded
} from '../../store/slices/usersSlice'
import { alertSuccess, alertError, confirm } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'
import api from '../../utils/api'

const UsersTab = () => {
  const dispatch = useDispatch()
  const usersState = useSelector(state => state.users)
  const auth = useSelector(state => state.auth)
  const {
    users,
    roles,
    permissions,
    loading,
    error,
    usersLoaded,
    rolesLoaded,
    permissionsLoaded,
    showUserModal,
    showRoleModal,
    editingUser,
    editingRole,
    userForm,
    roleForm
  } = usersState

  const [activeTab, setActiveTab] = useState('users') // 'users' or 'roles'
  const [selectedPermissions, setSelectedPermissions] = useState({})
  const [hideIfNoAccess, setHideIfNoAccess] = useState({}) // Track hide_if_no_access for each permission
  const [hideCompletely, setHideCompletely] = useState({}) // Track hide_completely for each permission

  // Debug logging
  useEffect(() => {
    console.log('UsersTab state:', {
      usersCount: users.length,
      rolesCount: roles.length,
      permissionsCount: permissions.length,
      usersLoaded,
      rolesLoaded,
      permissionsLoaded,
      loading,
      error
    })
    if (activeTab === 'roles') {
      console.log('Roles tab active - roles data:', roles)
      console.log('Roles loaded:', rolesLoaded)
      console.log('Error:', error)
      console.log('Loading:', loading)
    }
  }, [users, roles, permissions, usersLoaded, rolesLoaded, permissionsLoaded, loading, error, activeTab])

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!usersLoaded) {
          await dispatch(loadUsers()).unwrap()
        }
        if (!rolesLoaded) {
          try {
            await dispatch(loadRoles()).unwrap()
          } catch (rolesError) {
            console.error('Error loading roles:', rolesError)
            // If it's a 404 "User not found", it might be a token issue
            if (rolesError?.includes('User not found') || rolesError?.includes('404')) {
              console.error('User not found error - this might be a token/session issue. Please logout and login again.')
            }
            // Don't block other data loading
          }
        }
        if (!permissionsLoaded && auth.isAuthenticated) {
          try {
            await dispatch(loadPermissions()).unwrap()
          } catch (permsError) {
            console.error('Error loading permissions:', permsError)
            // Don't block other data loading
          }
        }
      } catch (error) {
        console.error('Error loading data:', error)
        // Don't show error to user if it's a permission issue - just log it
        if (error?.includes('Permission denied') || error?.includes('403')) {
          console.warn('Permission denied - user may not have access to roles/permissions')
        }
      }
    }
    loadData()
  }, [dispatch, usersLoaded, rolesLoaded, permissionsLoaded])

  useEffect(() => {
    if (editingRole && permissions.length > 0) {
      const rolePerms = editingRole.permissions?.map(p => p.id) || []
      const permMap = {}
      const hideMap = {}
      const hideCompleteMap = {}
      permissions.forEach(perm => {
        permMap[perm.id] = rolePerms.includes(perm.id)
        // Get hide_if_no_access and hide_completely from role permission or permission default
        const rolePerm = editingRole.permissions?.find(p => p.id === perm.id)
        hideMap[perm.id] = rolePerm?.hide_if_no_access !== undefined ? rolePerm.hide_if_no_access : (perm.hide_if_no_access || 0)
        hideCompleteMap[perm.id] = rolePerm?.hide_completely !== undefined ? rolePerm.hide_completely : (perm.hide_completely || 0)
      })
      setSelectedPermissions(permMap)
      setHideIfNoAccess(hideMap)
      setHideCompletely(hideCompleteMap)
    } else if (!editingRole) {
      setSelectedPermissions({})
      setHideIfNoAccess({})
      setHideCompletely({})
    }
  }, [editingRole, permissions])

  const handleCreateUser = () => {
    dispatch(resetUserForm())
    dispatch(setEditingUser(null))
    dispatch(setShowUserModal(true))
  }

  const handleEditUser = (user) => {
    dispatch(setEditingUser(user))
    dispatch(setShowUserModal(true))
  }

  const handleSaveUser = async () => {
    if (!userForm.username) {
      alertError('Username is required', 'Validation Error')
      return
    }

    if (!editingUser && !userForm.password) {
      alertError('Password is required for new users', 'Validation Error')
      return
    }

    try {
      if (editingUser) {
        const updates = { ...userForm }
        if (!updates.password) {
          delete updates.password
        }
        await dispatch(updateUser({ userId: editingUser.id, userData: updates })).unwrap()
        alertSuccess('User updated successfully', 'Success')
      } else {
        await dispatch(createUser(userForm)).unwrap()
        alertSuccess('User created successfully', 'Success')
      }
      dispatch(loadUsers())
    } catch (error) {
      alertError(error || 'Failed to save user', 'Error')
    }
  }

  const handleDeleteUser = async (userId) => {
    const confirmed = await confirm('Are you sure you want to delete this user?', 'Delete User')
    if (!confirmed) return

    try {
      await dispatch(deleteUser(userId)).unwrap()
      alertSuccess('User deleted successfully', 'Success')
      dispatch(loadUsers())
    } catch (error) {
      alertError(error || 'Failed to delete user', 'Error')
    }
  }

  const handleCreateRole = () => {
    dispatch(resetRoleForm())
    dispatch(setEditingRole(null))
    setSelectedPermissions({})
    dispatch(setShowRoleModal(true))
  }

  const handleEditRole = (role) => {
    // Allow editing system roles - user can modify permissions but not name/description
    dispatch(setEditingRole(role))
    dispatch(setShowRoleModal(true))
  }

  const handleSaveRole = async () => {
    if (!editingRole) {
      alertError('Cannot create new roles. Only system roles are allowed.', 'Error')
      return
    }

    try {
      // Only include permissions that are actually selected
      const permissionIds = Object.keys(selectedPermissions).filter(id => selectedPermissions[id])
      console.log('Selected permissions before save:', selectedPermissions)
      console.log('Permission IDs to save (before filter):', permissionIds)
      
      // Build permission_settings for all selected permissions
      const permissionSettings = permissionIds.reduce((acc, permId) => {
        acc[permId] = { 
          hide_if_no_access: hideIfNoAccess[permId] ? 1 : 0,
          hide_completely: hideCompletely[permId] ? 1 : 0
        }
        return acc
      }, {})
      
      const roleData = {
        // For system roles, only update permissions, not name or description
        permission_ids: permissionIds,
        // Include hide_if_no_access and hide_completely settings for all permissions
        permission_settings: permissionSettings
      }
      
      console.log('Saving role with data:', roleData)
      
      // Only include name and description if it's not a system role
      if (editingRole.is_system !== 1) {
        roleData.name = roleForm.name
        roleData.description = roleForm.description
      }

      await dispatch(updateRole({ roleId: editingRole.id, roleData })).unwrap()
      // Force reload roles to get updated permissions
      // Wait a bit to ensure backend has committed the changes
      await new Promise(resolve => setTimeout(resolve, 200))
      // Reset rolesLoaded flag to force reload
      dispatch(setRolesLoaded(false))
      const reloadedRoles = await dispatch(loadRoles()).unwrap()
      console.log('Reloaded roles after update:', reloadedRoles)
      alertSuccess('Role permissions updated successfully', 'Success')
      dispatch(setShowRoleModal(false))
    } catch (error) {
      alertError(error || 'Failed to update role', 'Error')
    }
  }

  const handleDeleteRole = async (roleId) => {
    const confirmed = await confirm('Are you sure you want to delete this role?', 'Delete Role')
    if (!confirmed) return

    try {
      await dispatch(deleteRole(roleId)).unwrap()
      alertSuccess('Role deleted successfully', 'Success')
      dispatch(loadRoles())
    } catch (error) {
      alertError(error || 'Failed to delete role', 'Error')
    }
  }

  const togglePermission = (permId) => {
    setSelectedPermissions(prev => ({
      ...prev,
      [permId]: !prev[permId]
    }))
  }

  const toggleHideIfNoAccess = (permId) => {
    setHideIfNoAccess(prev => ({
      ...prev,
      [permId]: prev[permId] ? 0 : 1
    }))
  }

  const toggleHideCompletely = (permId) => {
    setHideCompletely(prev => ({
      ...prev,
      [permId]: prev[permId] ? 0 : 1
    }))
  }

  const groupedPermissions = permissions.reduce((acc, perm) => {
    const resource = perm.resource
    if (!acc[resource]) {
      acc[resource] = []
    }
    acc[resource].push(perm)
    return acc
  }, {})

  if (loading && !usersLoaded && !rolesLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner message="Loading users and roles..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b-2 overflow-x-auto scrollbar-thin" style={{ borderColor: 'var(--border-color)' }}>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'users'
              ? 'text-purple-400 border-purple-400'
              : 'border-transparent'
          }`}
          style={activeTab === 'users' ? {} : {
            color: 'var(--text-secondary)',
            borderColor: 'transparent'
          }}
        >
          <i className="fas fa-users mr-2"></i>
          Users
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'roles'
              ? 'text-purple-400 border-purple-400'
              : 'border-transparent'
          }`}
          style={activeTab === 'roles' ? {} : {
            color: 'var(--text-secondary)',
            borderColor: 'transparent'
          }}
        >
          <i className="fas fa-user-shield mr-2"></i>
          Roles & Permissions
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              User Management
            </h3>
            <button
              onClick={handleCreateUser}
              className="px-4 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2"
            >
              <i className="fas fa-plus"></i>
              New User
            </button>
          </div>

          {/* Users List */}
          <div className="space-y-3">
            {users.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
                No users found. Create your first user.
              </div>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-4 hover:border-purple-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
                          {user.username}
                        </h4>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          user.is_active
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {user.role_name && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/20 text-purple-400">
                            {user.role_name}
                          </span>
                        )}
                      </div>
                      <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                        {user.full_name && (
                          <div><i className="fas fa-user mr-2"></i>{user.full_name}</div>
                        )}
                        {user.email && (
                          <div><i className="fas fa-envelope mr-2"></i>{user.email}</div>
                        )}
                        {user.created_at && (
                          <div><i className="fas fa-calendar mr-2"></i>Created: {new Date(user.created_at).toLocaleString()}</div>
                        )}
                        {user.last_login && (
                          <div><i className="fas fa-clock mr-2"></i>Last login: {new Date(user.last_login).toLocaleString()}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-xs font-semibold transition-all"
                      >
                        <i className="fas fa-edit"></i> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs font-semibold transition-all"
                      >
                        <i className="fas fa-trash"></i> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                Roles & Permissions
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                System roles are pre-defined. You can only modify permissions for existing roles.
              </p>
            </div>
          </div>

          {/* Roles List */}
          <div className="space-y-3">
            {!rolesLoaded && loading ? (
              <div className="flex items-center justify-center py-10">
                <LoadingSpinner message="Loading roles..." />
              </div>
            ) : error && (error.includes('Permission denied') || error.includes('403')) ? (
              <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
                <i className="fas fa-lock text-4xl opacity-50 mb-4 block"></i>
                <p className="text-red-400 mb-2">Permission Denied</p>
                <p className="text-sm">You don't have permission to view roles.</p>
              </div>
            ) : error && (error.includes('User not found') || error.includes('404')) ? (
              <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
                <i className="fas fa-exclamation-triangle text-4xl opacity-50 mb-4 block"></i>
                <p className="text-red-400 mb-2">Authentication Error</p>
                <p className="text-sm mb-4">User not found. Please logout and login again.</p>
                <button
                  onClick={() => {
                    // Clear auth token and reload
                    localStorage.removeItem('auth_token')
                    window.location.href = '/login'
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  Logout and Login Again
                </button>
              </div>
            ) : roles.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
                <i className="fas fa-user-shield text-4xl opacity-50 mb-4 block"></i>
                <p>No roles found.</p>
                {error && (
                  <p className="text-red-400 text-sm mt-2">Error: {error}</p>
                )}
                {!error && rolesLoaded && (
                  <p className="text-sm mt-2">Roles may not be initialized. Please check server logs.</p>
                )}
              </div>
            ) : (
              roles.map((role) => (
                <div
                  key={role.id}
                  className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-4 hover:border-purple-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
                          {role.name}
                        </h4>
                        {role.is_system === 1 && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-400">
                            System Role
                          </span>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                          {role.description}
                        </p>
                      )}
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <i className="fas fa-shield-alt mr-2"></i>
                        {role.permissions?.length || 0} permissions
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEditRole(role)}
                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-xs font-semibold transition-all"
                        title="Edit role permissions"
                      >
                        <i className="fas fa-edit"></i> Edit Permissions
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed z-[2000] left-0 top-0 w-full h-full bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#2a2a3e] border border-[#3a3a4e] rounded-lg p-4 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>
                {editingUser ? 'Edit User' : 'Create New User'}
              </h3>
              <button
                onClick={() => {
                  dispatch(setShowUserModal(false))
                  dispatch(resetUserForm())
                }}
                className="w-8 h-8 bg-[#3a3a4e] hover:bg-[#4a4a5e] text-white rounded-lg transition-all flex items-center justify-center text-sm"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Username <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={userForm.username}
                  onChange={(e) => dispatch(updateUserForm({ username: e.target.value }))}
                  placeholder="Enter username"
                  className="w-full p-1.5 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg text-xs focus:outline-none focus:border-[#667eea]"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={!!editingUser}
                />
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Password {!editingUser && <span className="text-red-400">*</span>}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => dispatch(updateUserForm({ password: e.target.value }))}
                  placeholder={editingUser ? "Leave empty to keep current password" : "Enter password"}
                  className="w-full p-1.5 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg text-xs focus:outline-none focus:border-[#667eea]"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => dispatch(updateUserForm({ email: e.target.value }))}
                  placeholder="Enter email"
                  className="w-full p-1.5 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg text-xs focus:outline-none focus:border-[#667eea]"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={userForm.full_name}
                  onChange={(e) => dispatch(updateUserForm({ full_name: e.target.value }))}
                  placeholder="Enter full name"
                  className="w-full p-1.5 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg text-xs focus:outline-none focus:border-[#667eea]"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Role
                </label>
                <select
                  value={userForm.role_id || ''}
                  onChange={(e) => dispatch(updateUserForm({ role_id: e.target.value || null }))}
                  className="w-full p-1.5 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg text-xs focus:outline-none focus:border-[#667eea]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <option value="">No Role</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={userForm.is_active}
                  onChange={(e) => dispatch(updateUserForm({ is_active: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Active
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveUser}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
                >
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
                <button
                  onClick={() => {
                    dispatch(setShowUserModal(false))
                    dispatch(resetUserForm())
                  }}
                  className="px-4 py-2 bg-[#3a3a4e] hover:bg-[#4a4a5e] text-white rounded-lg font-semibold transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div className="fixed z-[2000] left-0 top-0 w-full h-full bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#2a2a3e] border border-[#3a3a4e] rounded-lg p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>
                {editingRole ? 'Edit Role' : 'Create New Role'}
              </h3>
              <button
                onClick={() => {
                  dispatch(setShowRoleModal(false))
                  dispatch(resetRoleForm())
                  setSelectedPermissions({})
                }}
                className="w-8 h-8 bg-[#3a3a4e] hover:bg-[#4a4a5e] text-white rounded-lg transition-all flex items-center justify-center text-sm"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Role Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => dispatch(updateRoleForm({ name: e.target.value }))}
                  placeholder="Enter role name"
                  className="w-full p-1.5 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg text-xs focus:outline-none focus:border-[#667eea]"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={editingRole?.is_system === 1}
                />
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Description
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => dispatch(updateRoleForm({ description: e.target.value }))}
                  placeholder="Enter role description"
                  rows="2"
                  className="w-full p-1.5 bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg text-xs focus:outline-none focus:border-[#667eea] resize-y"
                  style={{ color: 'var(--text-primary)' }}
                  disabled={editingRole?.is_system === 1}
                  readOnly={editingRole?.is_system === 1}
                />
              </div>

              <div>
                <label className="block mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Permissions
                </label>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {Object.entries(groupedPermissions).map(([resource, perms]) => (
                    <div key={resource} className="bg-[#1a1a2e] border border-[#3a3a4e] rounded-lg p-3">
                      <h5 className="text-xs font-semibold mb-2 capitalize" style={{ color: 'var(--text-primary)' }}>
                        {resource}
                      </h5>
                      <div className="space-y-1.5">
                        {perms.map(perm => (
                          <div key={perm.id} className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                checked={selectedPermissions[perm.id] || false}
                                onChange={() => togglePermission(perm.id)}
                                className="w-4 h-4 cursor-pointer"
                              />
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {perm.name} - {perm.description}
                              </span>
                            </label>
                            {selectedPermissions[perm.id] && (
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 cursor-pointer" title="Hide page/module if user doesn't have this permission">
                                  <input
                                    type="checkbox"
                                    checked={hideIfNoAccess[perm.id] === 1}
                                    onChange={() => toggleHideIfNoAccess(perm.id)}
                                    className="w-3 h-3 cursor-pointer"
                                  />
                                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }} title="Hide if no access">
                                    <i className="fas fa-eye-slash"></i>
                                  </span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer" title="Hide completely (don't show 'Permission denied' message)">
                                  <input
                                    type="checkbox"
                                    checked={hideCompletely[perm.id] === 1}
                                    onChange={() => toggleHideCompletely(perm.id)}
                                    className="w-3 h-3 cursor-pointer"
                                  />
                                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }} title="Hide completely">
                                    <i className="fas fa-ban"></i>
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveRole}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
                >
                  {editingRole ? 'Update Permissions' : 'Create Role'}
                </button>
                <button
                  onClick={() => {
                    dispatch(setShowRoleModal(false))
                    dispatch(resetRoleForm())
                    setSelectedPermissions({})
                  }}
                  className="px-4 py-2 bg-[#3a3a4e] hover:bg-[#4a4a5e] text-white rounded-lg font-semibold transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UsersTab

