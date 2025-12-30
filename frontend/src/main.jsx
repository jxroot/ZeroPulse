import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router-dom'
import store from './store'
import router from './router'
import { checkAuth } from './store/slices/authSlice'
import './index.css'

// Initialize auth check before rendering
const initApp = async () => {
  const state = store.getState()
  if (state.auth.token) {
    try {
      await store.dispatch(checkAuth())
    } catch (err) {
      // If checkAuth fails, it will be handled by the reducer
      console.error('Auth check failed:', err)
    }
  } else {
    // Mark as initialized even if no token
    store.dispatch({ type: 'auth/setInitialized' })
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </StrictMode>,
  )
}

initApp()
