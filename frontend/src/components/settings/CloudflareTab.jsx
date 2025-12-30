import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import api from '../../utils/api'
import { alertSuccess, alertError } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'

const CloudflareTab = () => {
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [formData, setFormData] = useState({
    api_token: '',
    account_id: '',
    domain: ''
  })
  const [hasCredentials, setHasCredentials] = useState(false)
  const [maskedToken, setMaskedToken] = useState('')
  const [errors, setErrors] = useState([])
  const [verificationStatus, setVerificationStatus] = useState(null)

  useEffect(() => {
    loadCloudflareCredentials()
  }, [])

  const loadCloudflareCredentials = async () => {
    try {
      setLoading(true)
      const response = await api.get('/settings/cloudflare')
      if (response.data.success) {
        setHasCredentials(response.data.has_credentials || false)
        setMaskedToken(response.data.api_token_masked || '')
        setFormData({
          api_token: '',  // Always empty for security - user must enter token to update
          account_id: response.data.account_id || '',
          domain: response.data.domain || ''
        })
      }
    } catch (error) {
      alertError(error.response?.data?.detail || error.message || 'Failed to load Cloudflare credentials', 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!formData.account_id || !formData.domain) {
      alertError('Please fill in Account ID and Domain before verifying', 'Validation Error')
      return
    }
    
    // If token is empty but credentials exist, we'll use existing token from backend
    if (!formData.api_token && !hasCredentials) {
      alertError('Please enter your Cloudflare API Token', 'Validation Error')
      return
    }

    setVerifying(true)
    setErrors([])
    setVerificationStatus(null)

    try {
      const response = await api.post('/settings/cloudflare/verify', {
        api_token: formData.api_token,
        account_id: formData.account_id,
        domain: formData.domain
      })

      if (response.data.success) {
        setVerificationStatus({
          success: true,
          message: 'Credentials verified',
          token_valid: response.data.token_valid,
          account_valid: response.data.account_valid,
          domain_valid: response.data.domain_valid
        })
      } else {
        setVerificationStatus({
          success: false,
          message: 'Verification failed',
          errors: response.data.errors || []
        })
        // Don't set errors separately - they're shown in verificationStatus
        setErrors([])
      }
    } catch (error) {
      const errorData = error.response?.data
      setVerificationStatus({
        success: false,
        message: errorData?.detail || 'Verification failed',
        errors: errorData?.errors || []
      })
      // Don't set errors separately - they're shown in verificationStatus
      setErrors([])
      // Don't show alertError - error is shown in verificationStatus box
    } finally {
      setVerifying(false)
    }
  }

  const handleSave = async () => {
    if (!formData.account_id || !formData.domain) {
      alertError('Please fill in Account ID and Domain', 'Validation Error')
      return
    }
    
    // If token is empty but credentials exist, we'll use existing token from backend
    if (!formData.api_token && !hasCredentials) {
      alertError('Please enter your Cloudflare API Token', 'Validation Error')
      return
    }

    setSaving(true)
    setErrors([])

    try {
      // First verify credentials before saving
      setVerifying(true)
      const verifyResponse = await api.post('/settings/cloudflare/verify', {
        api_token: formData.api_token,
        account_id: formData.account_id,
        domain: formData.domain
      })

      // Check if verification was successful
      if (!verifyResponse.data.success || !verifyResponse.data.token_valid || !verifyResponse.data.account_valid || !verifyResponse.data.domain_valid) {
        const verifyErrors = verifyResponse.data.errors || []
        const errorMsg = verifyErrors.length > 0 ? verifyErrors.join(', ') : 'Credentials verification failed. Please check your credentials and try again.'
        setErrors(verifyErrors.length > 0 ? verifyErrors : [errorMsg])
        alertError(errorMsg, 'Verification Failed')
        setVerificationStatus({
          success: false,
          message: 'Credentials verification failed'
        })
        return
      }

      // Verification successful, now save
      setVerifying(false)
      const response = await api.put('/settings/cloudflare', {
        api_token: formData.api_token,
        account_id: formData.account_id,
        domain: formData.domain
      })

      if (response.data.success) {
        alertSuccess('Cloudflare credentials verified and updated successfully!', 'Success')
        // Reload credentials
        await loadCloudflareCredentials()
        setVerificationStatus({
          success: true,
          message: 'Credentials verified and saved successfully'
        })
        // If token was entered, clear it after save
        if (formData.api_token) {
          setFormData(prev => ({ ...prev, api_token: '' }))
        }
      }
    } catch (error) {
      const errorData = error.response?.data
      const errorMsg = errorData?.detail || error.message || 'Failed to verify or update credentials'
      setErrors(errorData?.errors || [errorMsg])
      alertError(errorMsg, 'Error')
      setVerificationStatus({
        success: false,
        message: errorMsg
      })
    } finally {
      setSaving(false)
      setVerifying(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    // Clear errors when user changes input
    if (errors.length > 0) {
      setErrors([])
    }
    if (verificationStatus) {
      setVerificationStatus(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner message="Loading Cloudflare credentials..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <i className="fas fa-cloud text-cyan-400 text-xl"></i>
        <h3 className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
          Cloudflare Account Settings
        </h3>
      </div>

      {/* Info Box */}
      <div 
        className="p-4 border-l-4 rounded flex items-start gap-3"
        style={{
          backgroundColor: isLightMode ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.1)',
          borderLeftColor: 'var(--info)'
        }}
      >
        <i className="fas fa-info-circle mt-0.5" style={{ color: 'var(--info)' }}></i>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p className="m-0 mb-2">
            Manage your Cloudflare account credentials. These credentials are used for tunnel management and DNS operations.
          </p>
          <p className="m-0 text-xs">
            <strong>Note:</strong> After updating credentials, you may need to restart the server for changes to take effect.
          </p>
        </div>
      </div>

      {/* Verification Status */}
      {verificationStatus && (
        <div 
          className="p-4 rounded-lg border"
          style={{
            backgroundColor: verificationStatus.success 
              ? (isLightMode ? 'rgba(40, 167, 69, 0.08)' : 'rgba(40, 167, 69, 0.1)')
              : (isLightMode ? 'rgba(220, 53, 69, 0.08)' : 'rgba(220, 53, 69, 0.1)'),
            borderColor: verificationStatus.success 
              ? (isLightMode ? 'rgba(40, 167, 69, 0.2)' : 'rgba(40, 167, 69, 0.3)')
              : (isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)')
          }}
        >
          <div className="flex items-start gap-3">
            <i className={`fas ${verificationStatus.success ? 'fa-check-circle' : 'fa-exclamation-circle'} ${
              verificationStatus.success ? 'text-green-400' : 'text-red-400'
            } mt-0.5`}></i>
            <div className="flex-1">
              <p className={`m-0 mb-2 font-semibold ${
                verificationStatus.success ? 'text-green-400' : 'text-red-400'
              }`}>
                {verificationStatus.message}
              </p>
              {verificationStatus.success && (
                <div className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex items-center gap-2">
                    <i className={`fas ${verificationStatus.token_valid ? 'fa-check text-green-400' : 'fa-times text-red-400'}`}></i>
                    <span>API Token: {verificationStatus.token_valid ? 'Valid' : 'Invalid'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className={`fas ${verificationStatus.account_valid ? 'fa-check text-green-400' : 'fa-times text-red-400'}`}></i>
                    <span>Account ID: {verificationStatus.account_valid ? 'Valid' : 'Invalid'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className={`fas ${verificationStatus.domain_valid ? 'fa-check text-green-400' : 'fa-times text-red-400'}`}></i>
                    <span>Domain: {verificationStatus.domain_valid ? 'Valid' : 'Invalid'}</span>
                  </div>
                </div>
              )}
              {verificationStatus.errors && verificationStatus.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-red-400">
                  {verificationStatus.errors.map((err, idx) => (
                    <li key={idx}>
                      {typeof err === 'string' ? err : err.message || JSON.stringify(err)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Errors - Only show if not already shown in verificationStatus */}
      {errors.length > 0 && !verificationStatus && (
        <div 
          className="p-4 border rounded-lg"
          style={{
            backgroundColor: isLightMode ? 'rgba(220, 53, 69, 0.08)' : 'rgba(220, 53, 69, 0.1)',
            borderColor: isLightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.3)'
          }}
        >
          <div className="flex items-start gap-3">
            <i className="fas fa-exclamation-circle text-red-400 mt-0.5"></i>
            <div className="flex-1">
              <p className="m-0 mb-2 font-semibold text-red-400">Validation Errors</p>
              <ul className="space-y-1 text-sm text-red-400">
                {errors.map((err, idx) => (
                  <li key={idx}>
                    {typeof err === 'string' ? err : err.message || JSON.stringify(err)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="space-y-4">
        {/* API Token */}
        <div>
          <label className="block mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-key mr-2 text-purple-400"></i>
            Cloudflare API Token <span className="text-red-400">*</span>
            {hasCredentials && !formData.api_token && (
              <span className="ml-2 text-xs font-normal text-green-400">
                <i className="fas fa-check-circle mr-1"></i>
                Configured
              </span>
            )}
          </label>
          {hasCredentials && !formData.api_token && maskedToken && (
            <div 
              className="mb-2 p-2.5 border rounded-lg"
              style={{
                backgroundColor: 'var(--bg-quaternary)',
                borderColor: 'var(--border-color)'
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Current Token:</span>
                <span className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>{maskedToken}</span>
              </div>
            </div>
          )}
          <input
            type="password"
            value={formData.api_token}
            onChange={(e) => handleChange('api_token', e.target.value)}
            placeholder={hasCredentials && !formData.api_token ? "Enter new token to update" : "Enter your Cloudflare API Token"}
            className="w-full p-3 border rounded-lg font-mono text-sm focus:outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {hasCredentials && !formData.api_token 
              ? "Token is already configured. Enter a new token to update it."
              : "Your Cloudflare API token with required permissions"}
          </p>
        </div>

        {/* Account ID */}
        <div>
          <label className="block mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-id-card mr-2 text-purple-400"></i>
            Cloudflare Account ID <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.account_id}
            onChange={(e) => handleChange('account_id', e.target.value)}
            placeholder="Enter your Cloudflare Account ID"
            className="w-full p-3 border rounded-lg font-mono text-sm focus:outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Your Cloudflare account identifier
          </p>
        </div>

        {/* Domain */}
        <div>
          <label className="block mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-globe mr-2 text-purple-400"></i>
            Cloudflare Domain <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.domain}
            onChange={(e) => handleChange('domain', e.target.value)}
            placeholder="example.com"
            className="w-full p-3 border rounded-lg font-mono text-sm focus:outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            The domain managed by your Cloudflare account
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <button
          onClick={handleVerify}
          disabled={verifying || saving || !formData.account_id || !formData.domain || (!formData.api_token && !hasCredentials)}
          className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            verifying || saving || !formData.account_id || !formData.domain || (!formData.api_token && !hasCredentials)
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-lg hover:-translate-y-0.5'
          }`}
        >
          {verifying ? (
            <>
              <i className="fas fa-spinner fa-spin"></i>
              Verifying...
            </>
          ) : (
            <>
              <i className="fas fa-check-circle"></i>
              Verify Credentials
            </>
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || verifying || !formData.account_id || !formData.domain || (!formData.api_token && !hasCredentials)}
          className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            saving || verifying || !formData.account_id || !formData.domain || (!formData.api_token && !hasCredentials)
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-blue-500 text-white hover:shadow-lg hover:-translate-y-0.5'
          }`}
        >
          {saving ? (
            <>
              <i className="fas fa-spinner fa-spin"></i>
              Saving...
            </>
          ) : (
            <>
              <i className="fas fa-save"></i>
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default CloudflareTab

