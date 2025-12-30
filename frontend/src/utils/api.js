import axios from 'axios'
import store from '../store'
import { logout } from '../store/slices/authSlice'

const API_BASE = '/api'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    const state = store.getState()
    // Try to get token from Redux store first, then fallback to localStorage
    let token = state.auth.token
    if (!token) {
      token = localStorage.getItem('auth_token')
    }
    
    if (token && !config.url.startsWith('/auth/login')) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      store.dispatch(logout())
    }
    
    return Promise.reject(error)
  }
)

export default api

