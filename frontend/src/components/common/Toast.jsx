import { useState, useEffect } from 'react'

const Toast = ({ message, type = 'info', duration = 3000, onClose }) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    const timeoutId = setTimeout(() => {
      setVisible(false)
      if (onClose) {
        setTimeout(onClose, 300) // Wait for animation
      }
    }, duration)

    return () => clearTimeout(timeoutId)
  }, [message, duration, onClose])

  const typeClasses = {
    success: 'bg-[#28a745] text-white',
    error: 'bg-[#dc3545] text-white',
    warning: 'bg-[#ffc107] text-black',
    info: 'bg-[#17a2b8] text-white'
  }

  const iconClasses = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  }

  if (!visible) return null

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg min-w-[300px] max-w-[500px] transition-all duration-300 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      } ${typeClasses[type]}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <i className={`fas ${iconClasses[type]}`}></i>
          <span>{message}</span>
        </div>
        <button
          onClick={() => {
            setVisible(false)
            if (onClose) {
              setTimeout(onClose, 300)
            }
          }}
          className="text-white hover:text-gray-200 transition-colors"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
    </div>
  )
}

export default Toast

