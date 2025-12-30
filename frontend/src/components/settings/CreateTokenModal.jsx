import { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { createPortal } from 'react-dom'

const CreateTokenModal = ({ onClose, onCreate, availablePermissions }) => {
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    expiration_type: '30days',
    permissions: []
  })

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

  const handleCreate = () => {
    if (!formData.name.trim()) {
      return
    }
    if (!formData.permissions || formData.permissions.length === 0) {
      return
    }
    onCreate(formData)
  }

  const modalContent = (
    <div 
      className="fixed z-[1001] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
    >
      <div 
        className="rounded-xl w-full shadow-2xl border overflow-hidden my-4"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: 'var(--border-color)',
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="bg-gradient-to-r from-purple-600 to-blue-500 text-white p-5 flex justify-between items-center flex-shrink-0">
          <h3 className="m-0 text-xl font-semibold">Create API Token</h3>
          <button
            onClick={onClose}
            className="text-white text-2xl font-bold cursor-pointer transition-transform duration-200 hover:scale-125 hover:text-red-200"
          >
            &times;
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <div className="mb-4">
            <label className="block mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>Token Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Production API Token"
              className="w-full p-3 border rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              placeholder="Optional description"
              className="w-full p-3 border rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>Expiration</label>
            <select
              value={formData.expiration_type}
              onChange={(e) => setFormData(prev => ({ ...prev, expiration_type: e.target.value }))}
              className="w-full p-3 border rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            >
              <option value="30days">30 Days</option>
              <option value="3months">3 Months</option>
              <option value="1year">1 Year</option>
              <option value="never">Never Expires</option>
            </select>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block font-medium" style={{ color: 'var(--text-primary)' }}>Permissions *</label>
              <button
                onClick={toggleAllPermissions}
                type="button"
                className="text-xs transition-colors"
                style={{ color: 'var(--accent-primary)' }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                <i className="fas fa-check-double mr-1"></i>
                Select All
              </button>
            </div>
            <div 
              className="border rounded-lg p-3 overflow-y-auto"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                maxHeight: '300px'
              }}
            >
              <label 
                className="flex items-center gap-2 cursor-pointer p-2 rounded mb-2 border-b pb-2"
                style={{ borderBottomColor: 'var(--border-color)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <input
                  type="checkbox"
                  checked={hasAllPermissions}
                  onChange={toggleAllPermissions}
                  className="w-4 h-4 rounded"
                  style={{
                    accentColor: 'var(--accent-primary)',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-color)'
                  }}
                />
                <span className="text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>
                  <i className="fas fa-shield-alt mr-1"></i>
                  All Permissions (*)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availablePermissions.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded"
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      value={perm}
                      checked={formData.permissions.includes(perm) || formData.permissions.includes('*')}
                      onChange={() => togglePermission(perm)}
                      className="w-4 h-4 rounded"
                      style={{
                        accentColor: 'var(--accent-primary)',
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)'
                      }}
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{perm}</span>
                  </label>
                ))}
              </div>
              {formData.permissions.length === 0 && (
                <div className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  At least one permission must be selected
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg transition-colors"
              style={{
                backgroundColor: isLightMode ? '#6c757d' : '#4e5560',
                color: '#ffffff'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isLightMode ? '#5a6268' : '#3d4248'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isLightMode ? '#6c757d' : '#4e5560'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!formData.name.trim() || !formData.permissions || formData.permissions.length === 0}
              className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Token
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default CreateTokenModal

