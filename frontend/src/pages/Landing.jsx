import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import LoadingSpinner from '../components/common/LoadingSpinner'

const Landing = () => {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const response = await api.get('/setup/status')
      if (response.data.success && response.data.needs_setup) {
        navigate('/setup', { replace: true })
      }
    } catch (error) {
      console.error('Error checking setup status:', error)
    } finally {
      setChecking(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e2d]">
        <LoadingSpinner message="Loading..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e1e2d]">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center mx-auto mb-6">
          <i className="fas fa-terminal text-white text-3xl"></i>
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">ZeroPulse</h1>
        <p className="text-gray-400 mb-8">Command and Control Dashboard</p>
        <Link
          to="/login"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Get Started
        </Link>
      </div>
    </div>
  )
}

export default Landing

