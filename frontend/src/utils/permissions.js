/**
 * Permission utilities for RBAC
 * Helper functions to check user permissions in frontend
 */

/**
 * Check if user has a specific permission
 * @param {Array<string>} userPermissions - Array of permission names
 * @param {string} permission - Permission to check (e.g., "users:manage")
 * @returns {boolean}
 */
export const hasPermission = (userPermissions, permission) => {
  // Single user system - all users have all permissions
  return true
}

/**
 * Check if user has any of the specified permissions
 * @param {Array<string>} userPermissions - Array of permission names
 * @param {Array<string>} permissions - Array of permissions to check
 * @returns {boolean}
 */
export const hasAnyPermission = (userPermissions, permissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false
  }
  return permissions.some(perm => userPermissions.includes(perm))
}

/**
 * Check if user has all of the specified permissions
 * @param {Array<string>} userPermissions - Array of permission names
 * @param {Array<string>} permissions - Array of permissions to check
 * @returns {boolean}
 */
export const hasAllPermissions = (userPermissions, permissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false
  }
  return permissions.every(perm => userPermissions.includes(perm))
}

/**
 * Check if user has permission for a resource
 * @param {Array<string>} userPermissions - Array of permission names
 * @param {string} resource - Resource name (e.g., "users")
 * @param {string} action - Action name (e.g., "view", "manage")
 * @returns {boolean}
 */
export const hasResourcePermission = (userPermissions, resource, action) => {
  return hasPermission(userPermissions, `${resource}:${action}`)
}

/**
 * Check if a page/module should be hidden based on hide_if_no_access setting
 * @param {Array<string>} userPermissions - Array of permission names
 * @param {string} permission - Permission to check
 * @param {number} hideIfNoAccess - hide_if_no_access flag (0 or 1)
 * @returns {boolean} - true if should hide, false if should show
 */
export const shouldHidePage = (userPermissions, permission, hideIfNoAccess) => {
  if (!hideIfNoAccess || hideIfNoAccess === 0) {
    return false // Don't hide if flag is not set
  }
  // Hide if user doesn't have the permission
  return !hasPermission(userPermissions, permission)
}

/**
 * Check if a page/module should be completely hidden (no "Permission denied" message)
 * @param {Array<string>} userPermissions - Array of permission names
 * @param {string} permission - Permission to check
 * @param {number} hideCompletely - hide_completely flag (0 or 1)
 * @returns {boolean} - true if should hide completely, false if should show "Permission denied"
 */
export const shouldHideCompletely = (userPermissions, permission, hideCompletely) => {
  if (!hasPermission(userPermissions, permission)) {
    // User doesn't have permission
    if (hideCompletely && hideCompletely === 1) {
      return true // Hide completely
    }
    return false // Show "Permission denied" message
  }
  return false // User has permission, don't hide
}

/**
 * Get permissions hook (to be used with Redux)
 * Returns current user's permissions from Redux store
 */
export const usePermissions = () => {
  // This will be used in components
  // For now, we'll load permissions on mount
  return {
    hasPermission: (permission) => {
      // Will be implemented with Redux selector
      return false
    },
    hasAnyPermission: (permissions) => {
      return false
    },
    hasAllPermissions: (permissions) => {
      return false
    },
    hasResourcePermission: (resource, action) => {
      return false
    }
  }
}

