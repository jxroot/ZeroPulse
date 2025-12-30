import store from '../store'
import { showAlert, showSuccess, showError, showWarning, showInfo, showConfirm } from '../store/slices/alertSlice'

/**
 * Show an alert dialog
 */
export function alert(message, title = 'Alert') {
  store.dispatch(showInfo({ message, title }))
}

/**
 * Show a success alert
 */
export function alertSuccess(message, title = 'Success') {
  store.dispatch(showSuccess({ message, title }))
}

/**
 * Format error message from API response
 * Handles validation_errors array and formats them nicely
 */
export function formatErrorMessage(error) {
  // If error is a string, return it as is
  if (typeof error === 'string') {
    return error
  }

  // If error is an object with response.data
  const errorData = error?.response?.data || error?.data || error

  // Check for validation_errors array
  if (errorData?.validation_errors && Array.isArray(errorData.validation_errors) && errorData.validation_errors.length > 0) {
    // Format validation errors: "field: message" or just "message"
    const formattedErrors = errorData.validation_errors.map(err => {
      let field = err.field?.replace('body.', '') || ''
      let message = err.message || ''
      
      // Remove "Value error, " prefix if present
      message = message.replace(/^Value error,\s*/i, '').trim()
      
      if (field && message) {
        return `${field}: ${message}`
      }
      return message || field
    })
    return formattedErrors.join('\n')
  }

  // Fallback to detail, message, or error string
  return errorData?.detail || errorData?.message || error?.message || String(error)
}

/**
 * Show an error alert
 */
export function alertError(message, title = 'Error') {
  // If message is an error object, format it
  const formattedMessage = typeof message === 'object' ? formatErrorMessage(message) : message
  store.dispatch(showError({ message: formattedMessage, title }))
}

/**
 * Show a warning alert
 */
export function alertWarning(message, title = 'Warning') {
  store.dispatch(showWarning({ message, title }))
}

/**
 * Show an info alert
 */
export function alertInfo(message, title = 'Info') {
  store.dispatch(showInfo({ message, title }))
}

/**
 * Show a confirm dialog
 * Returns a Promise that resolves to true if confirmed, false if cancelled
 */
export function confirm(message, title = 'Confirm') {
  return new Promise((resolve) => {
    store.dispatch(showConfirm({
      message,
      title,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    }))
  })
}

