import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchUserInfo, logout } from '../../store/slices/authSlice'
import { formatErrorMessage, alertError } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'
import api from '../../utils/api'

const ProfileTab = () => {
  const dispatch = useDispatch()
  const { user, loading } = useSelector(state => state.auth)
  
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        password: ''
      })
    } else {
      // Load user info if not available
      dispatch(fetchUserInfo())
    }
  }, [user, dispatch])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSave = async () => {
    if (!formData.username) {
      alertError('Username is required', 'Validation Error')
      return
    }

    setSaving(true)
    try {
      const updates = { ...formData }
      // Remove password if empty
      if (!updates.password) {
        delete updates.password
      }
      
      const response = await api.put('/users/me', updates)
      
      // Check if user should logout (username or password changed)
      if (response.data?.should_logout) {
        setResult({
          success: true,
          message: 'Profile updated successfully. You will be logged out due to username/password change.'
        })
        // Wait a bit for user to see the message, then logout
        setTimeout(() => {
          // Clear local state and redirect to login
          dispatch(logout())
          // Redirect to login page - use window.location.href for full page reload
          window.location.href = '/login'
        }, 1500)
        // Don't call fetchUserInfo() - session is already invalidated
        return
      } else {
      await dispatch(fetchUserInfo())
        setResult({
          success: true,
          message: 'Profile updated successfully'
        })
      // Clear password field after save
      setFormData(prev => ({ ...prev, password: '' }))
        // Clear result message after 3 seconds
        setTimeout(() => setResult(null), 3000)
      }
    } catch (error) {
      // Check if error is 401 (unauthorized) - might be due to session invalidation
      if (error.response?.status === 401) {
        // Session might have been invalidated - logout and redirect
        setResult({
          success: false,
          message: 'Your session has expired. Please login again.'
        })
        setTimeout(() => {
          dispatch(logout())
          window.location.href = '/login'
        }, 2000)
        return
      }
      
      const errorData = error.response?.data || error
      const errorMessage = formatErrorMessage(errorData)
      setResult({
        success: false,
        message: errorMessage
      })
      // Clear error message after 5 seconds
      setTimeout(() => setResult(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner message="Loading profile..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Profile Settings
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Manage your account information and preferences.
        </p>
      </div>

      {/* Result Message */}
      {result && (
        <div
          className={`p-4 rounded-lg ${
            result.success
              ? 'bg-green-500/15 border border-green-500/30'
              : 'bg-red-500/15 border border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <i
              className={`fas text-lg ${
                result.success ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-red-400'
              }`}
            ></i>
            <div className="flex-1">
              <strong className={result.success ? 'text-green-400' : 'text-red-400'}>
                {result.success ? 'Success' : 'Error'}
              </strong>
              <p className={`text-sm mt-1 whitespace-pre-line ${result.success ? 'text-green-300' : 'text-red-300'}`}>
                {result.message}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-6 space-y-4">
        <div>
          <label className="block mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Username <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Enter username"
            className="w-full p-2 border rounded-lg text-sm focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          />
        </div>

        <div>
          <label className="block mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Password
          </label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Leave empty to keep current password"
            className="w-full p-2 border rounded-lg text-sm focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Leave empty to keep your current password
          </p>
        </div>


        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProfileTab

