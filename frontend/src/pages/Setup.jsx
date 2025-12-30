import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import api from '../utils/api'
import LoadingSpinner from '../components/common/LoadingSpinner'

const Setup = () => {
  const navigate = useNavigate()
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [currentStep, setCurrentStep] = useState(1) // 1: User account, 2: Cloudflare credentials, 3: Permissions
  const [cloudflareErrors, setCloudflareErrors] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const [submitError, setSubmitError] = useState('')
  const [credentialsVerified, setCredentialsVerified] = useState(false)
  const [permissionsVerified, setPermissionsVerified] = useState(false)
  const [permissionsStatus, setPermissionsStatus] = useState({
    'Account: Cloudflare Tunnel: Edit': { checked: false, status: 'pending' }, // pending, checking, verified, failed
    'Zone: DNS: Edit': { checked: false, status: 'pending' }
  })
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    cloudflare_api_token: '',
    cloudflare_account_id: '',
    cloudflare_domain: ''
  })

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const response = await api.get('/setup/status')
      if (response.data.success) {
        setNeedsSetup(response.data.needs_setup)
        if (!response.data.needs_setup) {
          // Already set up, redirect to login
          navigate('/login', { replace: true })
        }
      }
    } catch (error) {
      console.error('Error checking setup status:', error)
      // Error handled silently, will redirect if needed
    } finally {
      setLoading(false)
    }
  }


  const validatePassword = (password) => {
    const errors = []
    
    if (!password) {
      return ['Password is required']
    }
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }
    
    if (password.length > 128) {
      errors.push('Password must be less than 128 characters')
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number')
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*...)')
    }
    
    // Check for common weak passwords
    const weakPasswords = [
      'password', '12345678', 'qwerty', 'abc123', 'password123',
      'admin', 'letmein', 'welcome', 'monkey', '1234567890'
    ]
    if (weakPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common. Please choose a stronger password')
    }
    
    return errors
  }

  const handleNextStep = () => {
    // Validation for step 1
    if (currentStep === 1) {
      const errors = []
      
      if (!formData.username || !formData.username.trim()) {
        errors.push('Username is required')
      }

      if (formData.username && formData.username.length > 100) {
        errors.push('Username must be less than 100 characters')
      }

      // Validate password strength
      const passwordErrors = validatePassword(formData.password)
      errors.push(...passwordErrors)

      if (formData.password !== formData.confirmPassword) {
        errors.push('Passwords do not match')
      }

      if (errors.length > 0) {
        setValidationErrors(errors)
        return
      }

      setValidationErrors([])
      setCurrentStep(2)
    }
  }

  const handlePreviousStep = () => {
    if (currentStep === 3) {
      setCurrentStep(2)
      setPermissionsVerified(false)
      setCloudflareErrors([])
    } else if (currentStep === 2) {
      setCurrentStep(1)
      setCredentialsVerified(false)
      setCloudflareErrors([])
    }
  }

  const handleVerifyCredentials = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!formData.cloudflare_api_token || !formData.cloudflare_account_id || !formData.cloudflare_domain) {
      setCloudflareErrors(['All Cloudflare credential fields are required'])
      return
    }

    setVerifying(true)
    setCloudflareErrors([])
    
    try {
      const verifyResponse = await api.post('/setup/verify-cloudflare', {
        api_token: formData.cloudflare_api_token,
        account_id: formData.cloudflare_account_id,
        domain: formData.cloudflare_domain
      })

      const tokenValid = verifyResponse.data.token_valid
      const accountValid = verifyResponse.data.account_valid
      const hasPermissionIssue = verifyResponse.data.has_permission_issue || false
      
      if (verifyResponse.data.success) {
        setCredentialsVerified(true)
        setCloudflareErrors([])
      } else if (hasPermissionIssue && tokenValid && accountValid) {
        // Credentials are valid but permissions are missing - allow to proceed
        setCredentialsVerified(true)
        setCloudflareErrors(['Credentials are valid but some permissions may be missing. Please proceed to the next step to verify all required permissions.'])
      } else {
        setCredentialsVerified(false)
        const errors = verifyResponse.data.errors || []
        const verifyErrors = errors.map(err => {
          if (typeof err === 'string') return err
          if (err && typeof err === 'object') {
            return err.message || err.detail || JSON.stringify(err)
          }
          return 'Credentials verification failed'
        })
        setCloudflareErrors(verifyErrors.length > 0 ? verifyErrors : ['Credentials verification failed'])
      }
    } catch (error) {
      setCredentialsVerified(false)
      
      // Check for permission errors in catch block too
      const errorResponse = error.response?.data
      if (errorResponse) {
        const errors = errorResponse.errors || []
        const hasPermissionError = errors.some(err => {
          if (typeof err === 'string') {
            return err.includes('Unauthorized') || err.includes('permission') || err.includes('9109')
          } else if (err && typeof err === 'object') {
            const code = err.code || err.error_code
            const message = err.message || err.detail || ''
            return code === 9109 || 
                   message.includes('Unauthorized') || 
                   message.includes('permission') ||
                   message.includes('access')
          }
          return false
        })
        
        if (hasPermissionError) {
          setCloudflareErrors(['Credentials are valid but missing required permissions. Please check your API token permissions and proceed to the next step to verify permissions.'])
        } else {
          const errorMsg = errorResponse.detail || error.message || 'Failed to verify credentials'
          setCloudflareErrors([errorMsg])
        }
      } else {
        const errorMsg = error.message || 'Failed to verify credentials'
        setCloudflareErrors([errorMsg])
      }
    } finally {
      setVerifying(false)
    }
  }

  const handleVerifyPermissions = async (e) => {
    e.preventDefault()
    
    setVerifying(true)
    setCloudflareErrors([])
    
    // Reset permissions status
    const initialStatus = {
      'Account: Cloudflare Tunnel: Edit': { checked: false, status: 'pending' },
      'Zone: DNS: Edit': { checked: false, status: 'pending' }
    }
    setPermissionsStatus(initialStatus)
    
    try {
      const permissionsResponse = await api.post('/setup/verify-permissions', {
        api_token: formData.cloudflare_api_token,
        account_id: formData.cloudflare_account_id,
        domain: formData.cloudflare_domain
      })

      // Always process permission_details if available (even if success is false)
      const permissionDetails = permissionsResponse.data.permission_details || {}
      
      // Process permission_details if available, regardless of success status
      if (permissionDetails && Object.keys(permissionDetails).length > 0) {
        // Check each permission one by one using permission_details from backend
        const permissionKeys = Object.keys(initialStatus)
        const updatedStatus = { ...initialStatus }
        
        for (let i = 0; i < permissionKeys.length; i++) {
          const permKey = permissionKeys[i]
          
          // Set status to checking
          updatedStatus[permKey] = { checked: false, status: 'checking' }
          setPermissionsStatus({ ...updatedStatus })
          
          // Wait a bit for visual feedback
          await new Promise(resolve => setTimeout(resolve, 800))
          
          // Get permission details from backend response
          const permDetail = permissionDetails[permKey]
          
          if (permDetail && permDetail.verified) {
            // Permission verified by backend (including Zone: DNS: Edit which is tested with zones.list())
            updatedStatus[permKey] = { checked: true, status: 'verified' }
          } else {
            // Permission not verified
            updatedStatus[permKey] = { checked: false, status: 'failed' }
          }
          
          setPermissionsStatus({ ...updatedStatus })
        }
        
        // Check if all permissions are verified
        const allVerified = Object.values(updatedStatus).every(p => p.status === 'verified')
        
        if (allVerified && permissionsResponse.data.has_required_permissions) {
          setPermissionsVerified(true)
          setCloudflareErrors([])
          // Only complete setup if all permissions are verified
          await handleCompleteSetup()
        } else {
          setPermissionsVerified(false)
          // Don't show error message - let the UI show individual permission status with checkmarks/X marks
          setCloudflareErrors([])
          // Don't complete setup if permissions are not valid
        }
      } else {
        // No permission_details - show error and don't complete setup
        setPermissionsVerified(false)
        const permErrors = permissionsResponse.data.errors || []
        const errorMsg = permErrors.join(', ') || 'Permissions verification failed'
        setCloudflareErrors([errorMsg])
        // Don't complete setup if permission_details is missing
      }
    } catch (error) {
      setPermissionsVerified(false)
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to verify permissions'
      setCloudflareErrors([errorMsg])
      // Don't complete setup if error occurs
    } finally {
      setVerifying(false)
    }
  }

  const handleCompleteSetup = async () => {
    setSubmitting(true)
    setCloudflareErrors([])
    
    try {
      const setupData = {
        username: formData.username,
        password: formData.password,
        cloudflare_api_token: formData.cloudflare_api_token || null,
        cloudflare_account_id: formData.cloudflare_account_id || null,
        cloudflare_domain: formData.cloudflare_domain || null
      }

      const response = await api.post('/setup', setupData)
      if (response.data.success) {
        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 1000)
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to complete setup'
      if (error.response?.data?.errors) {
        setCloudflareErrors(error.response.data.errors)
      } else {
        setCloudflareErrors([errorMsg])
      }
    } finally {
      setSubmitting(false)
    }
  }


  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    // Clear errors when user changes input
    if (e.target.name.startsWith('cloudflare_')) {
      setCloudflareErrors([])
    }
    setSubmitError('')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <LoadingSpinner message="Checking setup status..." />
      </div>
    )
  }

  if (!needsSetup) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="w-full max-w-md">
        <div className="card p-5">
          <div className="text-center mb-5">
            <div className="mb-3">
              <i className="fas fa-cog fa-spin text-4xl" style={{ color: 'var(--accent-primary)' }}></i>
            </div>
            <h1 className="text-xl font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
              System Setup
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {currentStep === 1 ? 'Create the first administrator account' : 
               currentStep === 2 ? 'Configure Cloudflare credentials' : 
               'Verify Cloudflare permissions'}
            </p>
            
            {/* Step indicator */}
            <div className="flex justify-center mt-4 space-x-2">
              <div 
                className="w-8 h-1 rounded transition-colors"
                style={{ 
                  backgroundColor: currentStep >= 1 
                    ? 'var(--accent-primary)' 
                    : (isLightMode ? 'var(--border-color)' : '#3a3a4e')
                }}
              ></div>
              <div 
                className="w-8 h-1 rounded transition-colors"
                style={{ 
                  backgroundColor: currentStep >= 2 
                    ? 'var(--accent-primary)' 
                    : (isLightMode ? 'var(--border-color)' : '#3a3a4e')
                }}
              ></div>
              <div 
                className="w-8 h-1 rounded transition-colors"
                style={{ 
                  backgroundColor: currentStep >= 3 
                    ? 'var(--accent-primary)' 
                    : (isLightMode ? 'var(--border-color)' : '#3a3a4e')
                }}
              ></div>
            </div>
          </div>

          {currentStep === 1 ? (
            <form onSubmit={(e) => { e.preventDefault(); handleNextStep(); }} className="space-y-3">
            {validationErrors.length > 0 && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400">
                  <i className="fas fa-exclamation-circle mr-1.5"></i>
                  {validationErrors.join(', ')}
                </p>
              </div>
            )}
            <div>
              <label className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                placeholder="Enter username"
                className="w-full p-2 rounded-lg text-xs focus:outline-none transition-colors"
                style={{ 
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  border: '1px solid'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)'
                  e.currentTarget.style.boxShadow = isLightMode 
                    ? '0 0 0 3px rgba(102, 126, 234, 0.1)' 
                    : '0 0 0 3px rgba(102, 126, 234, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                autoFocus
              />
            </div>

            <div>
              <label className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                  placeholder="Enter password (min 8 characters, uppercase, lowercase, number, special)"
                minLength={8}
                className="w-full p-2 rounded-lg text-xs focus:outline-none transition-colors"
                style={{ 
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  border: '1px solid'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)'
                  e.currentTarget.style.boxShadow = isLightMode 
                    ? '0 0 0 3px rgba(102, 126, 234, 0.1)' 
                    : '0 0 0 3px rgba(102, 126, 234, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            <div>
              <label className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Confirm password"
                className="w-full p-2 rounded-lg text-xs focus:outline-none transition-colors"
                style={{ 
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  border: '1px solid'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)'
                  e.currentTarget.style.boxShadow = isLightMode 
                    ? '0 0 0 3px rgba(102, 126, 234, 0.1)' 
                    : '0 0 0 3px rgba(102, 126, 234, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>


            <button
              type="submit"
                className="w-full py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
              >
                <i className="fas fa-arrow-right mr-2"></i>
                Next: Cloudflare Configuration
              </button>
            </form>
          ) : currentStep === 2 ? (
            <form onSubmit={handleVerifyCredentials} className="space-y-3">
              <div>
                <label className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Cloudflare API Token <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  name="cloudflare_api_token"
                  value={formData.cloudflare_api_token}
                  onChange={handleChange}
                  required
                  placeholder="Enter Cloudflare API Token"
                  className="w-full p-2 rounded-lg text-xs focus:outline-none transition-colors"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    border: '1px solid'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)'
                    e.currentTarget.style.boxShadow = isLightMode 
                      ? '0 0 0 3px rgba(102, 126, 234, 0.1)' 
                      : '0 0 0 3px rgba(102, 126, 234, 0.2)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Cloudflare Account ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="cloudflare_account_id"
                  value={formData.cloudflare_account_id}
                  onChange={handleChange}
                  required
                  placeholder="Enter Cloudflare Account ID"
                  className="w-full p-2 rounded-lg text-xs focus:outline-none transition-colors"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    border: '1px solid'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)'
                    e.currentTarget.style.boxShadow = isLightMode 
                      ? '0 0 0 3px rgba(102, 126, 234, 0.1)' 
                      : '0 0 0 3px rgba(102, 126, 234, 0.2)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Cloudflare Domain <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="cloudflare_domain"
                  value={formData.cloudflare_domain}
                  onChange={handleChange}
                  required
                  placeholder="example.com"
                  className="w-full p-2 rounded-lg text-xs focus:outline-none transition-colors"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    border: '1px solid'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)'
                    e.currentTarget.style.boxShadow = isLightMode 
                      ? '0 0 0 3px rgba(102, 126, 234, 0.1)' 
                      : '0 0 0 3px rgba(102, 126, 234, 0.2)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {cloudflareErrors.length > 0 && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-xs text-red-400">
                    <i className="fas fa-exclamation-circle mr-1.5"></i>
                    {cloudflareErrors.join(', ')}
                  </p>
                </div>
              )}

              {credentialsVerified && (
                <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-xs text-green-400">
                    <i className="fas fa-check-circle mr-1.5"></i>
                    Cloudflare credentials verified successfully!
                  </p>
                </div>
              )}

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handlePreviousStep}
                  disabled={verifying}
                  className="flex-1 py-2 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  style={{
                    backgroundColor: isLightMode ? 'var(--bg-tertiary)' : '#3a3a4e',
                    color: 'var(--text-primary)'
                  }}
                  onMouseEnter={(e) => {
                    if (!verifying) {
                      e.currentTarget.style.backgroundColor = isLightMode ? 'var(--border-color)' : '#4a4a5e'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isLightMode ? 'var(--bg-tertiary)' : '#3a3a4e'
                  }}
                >
                  <i className="fas fa-arrow-left mr-2"></i>
                  Back
                </button>
                {credentialsVerified ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="flex-1 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
                  >
                    <i className="fas fa-arrow-right mr-2"></i>
                    Next: Verify Permissions
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={verifying}
                    className="flex-1 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {verifying ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Verifying...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check mr-2"></i>
                        Verify Credentials
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyPermissions} className="space-y-3">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>
                  <i className="fas fa-info-circle mr-1.5"></i>
                  Verifying that your Cloudflare API token has the required permissions for tunnel management.
                </p>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Required Permissions:
                </p>
              </div>

              {/* Permissions List */}
              <div className="space-y-2">
                {Object.entries(permissionsStatus).map(([permission, status]) => (
                  <div 
                    key={permission}
                    className="p-2.5 rounded-lg border transition-all"
                    style={{
                      backgroundColor: status.status === 'verified' 
                        ? 'rgba(40, 167, 69, 0.1)' 
                        : status.status === 'failed'
                        ? 'rgba(220, 53, 69, 0.1)'
                        : status.status === 'checking'
                        ? 'rgba(255, 193, 7, 0.1)'
                        : (isLightMode ? 'var(--bg-secondary)' : '#1a1a2e'),
                      borderColor: status.status === 'verified' 
                        ? 'rgba(40, 167, 69, 0.2)' 
                        : status.status === 'failed'
                        ? 'rgba(220, 53, 69, 0.2)'
                        : status.status === 'checking'
                        ? 'rgba(255, 193, 7, 0.2)'
                        : 'var(--border-color)'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                        {permission}
                      </span>
                      <div className="flex items-center">
                        {status.status === 'verified' && (
                          <i className="fas fa-check-circle text-green-400 text-sm"></i>
                        )}
                        {status.status === 'failed' && (
                          <i className="fas fa-times-circle text-red-400 text-sm"></i>
                        )}
                        {status.status === 'checking' && (
                          <i className="fas fa-spinner fa-spin text-yellow-400 text-sm"></i>
                        )}
                        {status.status === 'pending' && (
                          <i className="fas fa-circle text-gray-500 text-xs"></i>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {cloudflareErrors.length > 0 && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-xs text-red-400">
                    <i className="fas fa-exclamation-circle mr-1.5"></i>
                    {cloudflareErrors.join(', ')}
                  </p>
                </div>
              )}

              {permissionsVerified && (
                <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-xs text-green-400">
                    <i className="fas fa-check-circle mr-1.5"></i>
                    All required permissions verified successfully! Completing setup...
                  </p>
                </div>
              )}

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handlePreviousStep}
                  disabled={verifying || submitting || permissionsVerified}
                  className="flex-1 py-2 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  style={{
                    backgroundColor: isLightMode ? 'var(--bg-tertiary)' : '#3a3a4e',
                    color: 'var(--text-primary)'
                  }}
                  onMouseEnter={(e) => {
                    if (!verifying && !submitting && !permissionsVerified) {
                      e.currentTarget.style.backgroundColor = isLightMode ? 'var(--border-color)' : '#4a4a5e'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isLightMode ? 'var(--bg-tertiary)' : '#3a3a4e'
                  }}
                >
                  <i className="fas fa-arrow-left mr-2"></i>
                  Back
                </button>
                <button
                  type="submit"
                  disabled={verifying || submitting || permissionsVerified}
                  className="flex-1 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {submitting ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                      Completing setup...
                    </>
                  ) : verifying ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Verifying permissions...
                    </>
                  ) : permissionsVerified ? (
                    <>
                      <i className="fas fa-check mr-2"></i>
                      Setup Complete
                </>
              ) : (
                <>
                      <i className="fas fa-shield-alt mr-2"></i>
                      Verify Permissions
                </>
              )}
            </button>
              </div>
          </form>
          )}

          <div className="mt-4 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <i className="fas fa-info-circle mr-1.5"></i>
              {currentStep === 1 
                ? 'This will create the first administrator account with full system access.'
                : currentStep === 2
                ? 'Cloudflare credentials are required for tunnel management. Please verify your credentials.'
                : 'Verifying that your API token has the required permissions for tunnel management.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Setup

