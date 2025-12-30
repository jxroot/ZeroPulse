import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  isOpen: false,
  type: 'info',
  title: '',
  message: '',
  confirmText: 'OK',
  cancelText: 'Cancel',
  onConfirm: null,
  onCancel: null
}

const alertSlice = createSlice({
  name: 'alert',
  initialState,
  reducers: {
    showAlert: (state, action) => {
      const options = action.payload
      state.type = options.type || 'info'
      state.title = options.title || ''
      state.message = options.message || ''
      state.confirmText = options.confirmText || 'OK'
      state.cancelText = options.cancelText || 'Cancel'
      state.onConfirm = options.onConfirm || null
      state.onCancel = options.onCancel || null
      state.isOpen = true
    },
    showSuccess: (state, action) => {
      state.type = 'success'
      state.title = action.payload.title || 'Success'
      state.message = action.payload.message
      state.isOpen = true
    },
    showError: (state, action) => {
      state.type = 'error'
      state.title = action.payload.title || 'Error'
      state.message = action.payload.message
      state.isOpen = true
    },
    showWarning: (state, action) => {
      state.type = 'warning'
      state.title = action.payload.title || 'Warning'
      state.message = action.payload.message
      state.isOpen = true
    },
    showInfo: (state, action) => {
      state.type = 'info'
      state.title = action.payload.title || 'Info'
      state.message = action.payload.message
      state.isOpen = true
    },
    showConfirm: (state, action) => {
      const { message, title = 'Confirm', onConfirm, onCancel } = action.payload
      state.type = 'confirm'
      state.title = title
      state.message = message
      state.onConfirm = onConfirm
      state.onCancel = onCancel
      state.isOpen = true
    },
    close: (state) => {
      state.isOpen = false
    },
    reset: (state) => {
      state.type = 'info'
      state.title = ''
      state.message = ''
      state.confirmText = 'OK'
      state.cancelText = 'Cancel'
      state.onConfirm = null
      state.onCancel = null
    }
  }
})

export const {
  showAlert,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  showConfirm,
  close,
  reset
} = alertSlice.actions

export default alertSlice.reducer

