import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

const EditTokenModal = ({ token, onClose, onUpdate, availablePermissions }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: []
  })

  useEffect(() => {
    if (token) {
      const tokenPerms = token.permissions || []
      const hasAllPerms = tokenPerms.includes('*')
      setFormData({
        name: token.name || '',
        description: token.description || '',
        permissions: hasAllPerms ? [...availablePermissions, '*'] : [...tokenPerms]
      })
    }
  }, [token, availablePermissions])

  const hasAllPermissions = useMemo(() => {
    const perms = formData.permissions || []
    return perms.includes('*') || 
           (perms.length === availablePermissions.length && 
            availablePermissions.every(perm => perms.includes(perm)))
  }, [formData.permissions, availablePermissions])

  const togglePermission = (perm) => {
    setFormData(prev => {
      let newPerms = [...prev.permissions]
      
      // If '*' is selected, remove it first and select all permissions
      if (newPerms.includes('*')) {
        newPerms = [...availablePermissions]
      }
      
      const index = newPerms.indexOf(perm)
      if (index > -1) {
        newPerms.splice(index, 1)
      } else {
        newPerms.push(perm)
      }
      
      // Check if all permissions are selected, then add '*'
      if (newPerms.length === availablePermissions.length && 
          availablePermissions.every(p => newPerms.includes(p))) {
        if (!newPerms.includes('*')) {
          newPerms.push('*')
        }
      }
      
      return { ...prev, permissions: newPerms }
    })
  }

  const toggleAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      permissions: hasAllPermissions ? [] : [...availablePermissions, '*']
    }))
  }

  const handleUpdate = () => {
    if (!formData.name.trim()) {
      return
    }
    if (!formData.permissions || formData.permissions.length === 0) {
      return
    }
    onUpdate(token.id, formData)
  }

  const modalContent = (
    <div className="fixed z-[1001] left-0 top-0 w-full h-full bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#2b2b40] rounded-xl w-full max-w-[600px] shadow-2xl border border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-500 text-white p-5 flex justify-between items-center">
          <h3 className="m-0 text-xl font-semibold">Edit API Token</h3>
          <button
            onClick={onClose}
            className="text-white text-2xl font-bold cursor-pointer transition-transform duration-200 hover:scale-125 hover:text-red-200"
          >
            &times;
          </button>
        </div>
        <div className="p-6 bg-[#2b2b40]">
          <div className="mb-4">
            <label className="block mb-2 font-medium text-white">Token Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Production API Token"
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-medium text-white">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              placeholder="Optional description"
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block font-medium text-white">Permissions *</label>
              <button
                onClick={toggleAllPermissions}
                type="button"
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                <i className="fas fa-check-double mr-1"></i>
                Select All
              </button>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-700 mb-2 border-b border-gray-700 pb-2">
                <input
                  type="checkbox"
                  checked={hasAllPermissions}
                  onChange={toggleAllPermissions}
                  className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500"
                />
                <span className="text-sm font-semibold text-purple-400">
                  <i className="fas fa-shield-alt mr-1"></i>
                  All Permissions (*)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availablePermissions.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      value={perm}
                      checked={formData.permissions.includes(perm) || formData.permissions.includes('*')}
                      onChange={() => togglePermission(perm)}
                      className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500"
                    />
                    <span className="text-sm text-white">{perm}</span>
                  </label>
                ))}
              </div>
              {formData.permissions.length === 0 && (
                <div className="mt-2 text-xs text-red-400">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  At least one permission must be selected
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={!formData.name.trim() || !formData.permissions || formData.permissions.length === 0}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update Token
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default EditTokenModal

