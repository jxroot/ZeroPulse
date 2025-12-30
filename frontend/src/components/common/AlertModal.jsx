import { useSelector, useDispatch } from 'react-redux'
import { createPortal } from 'react-dom'
import { close, reset } from '../../store/slices/alertSlice'

const AlertModal = () => {
  const dispatch = useDispatch()
  const alert = useSelector(state => state.alert)

  if (!alert.isOpen) return null

  const defaultTitles = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Information',
    confirm: 'Confirm Action'
  }

  const iconClasses = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle',
    confirm: 'fas fa-question-circle'
  }

  const borderClasses = {
    success: 'border-t-4 border-t-[#28a745]',
    error: 'border-t-4 border-t-[#dc3545]',
    warning: 'border-t-4 border-t-[#ffc107]',
    info: 'border-t-4 border-t-[#6c5dd3]',
    confirm: 'border-t-4 border-t-[#17a2b8]'
  }

  const iconWrapperClasses = {
    success: 'bg-[rgba(40,167,69,0.15)] text-[#28a745]',
    error: 'bg-[rgba(220,53,69,0.15)] text-[#dc3545]',
    warning: 'bg-[rgba(255,193,7,0.15)] text-[#ffc107]',
    info: 'bg-[rgba(102,126,234,0.15)] text-[#6c5dd3]',
    confirm: 'bg-[rgba(23,162,184,0.15)] text-[#17a2b8]'
  }

  const buttonClasses = {
    success: 'bg-gradient-to-r from-[#28a745] to-[#20c997] text-white',
    error: 'bg-gradient-to-r from-[#dc3545] to-[#c82333] text-white',
    warning: 'bg-gradient-to-r from-[#ffc107] to-[#ff9800] text-[#212529]',
    info: 'bg-gradient-to-r from-[#6c5dd3] to-[#764ba2] text-white',
    confirm: 'bg-gradient-to-r from-[#17a2b8] to-[#138496] text-white'
  }

  const handleConfirm = () => {
    if (alert.onConfirm) {
      alert.onConfirm()
    }
    dispatch(close())
    setTimeout(() => dispatch(reset()), 300)
  }

  const handleCancel = () => {
    if (alert.onCancel) {
      alert.onCancel()
    }
    dispatch(close())
    setTimeout(() => dispatch(reset()), 300)
  }

  const formatMessage = (message) => {
    if (!message) return ''
    return message.replace(/\n/g, '<br>')
  }

  const modalContent = (
    <div className="fixed z-[2000] left-0 top-0 w-full h-full bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`bg-[#2b2b40] border border-gray-800 rounded-2xl w-full max-w-[500px] shadow-2xl overflow-hidden ${borderClasses[alert.type]}`}>
        <div className="flex items-center gap-4 p-6 border-b border-gray-800 relative">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${iconWrapperClasses[alert.type]}`}>
            <i className={iconClasses[alert.type]}></i>
          </div>
          <h3 className="flex-1 m-0 text-xl font-semibold text-white">
            {alert.title || defaultTitles[alert.type] || 'Alert'}
          </h3>
          {alert.type !== 'confirm' && (
            <button
              onClick={handleCancel}
              className="w-8 h-8 rounded-full border-none bg-transparent text-gray-400 cursor-pointer flex items-center justify-center transition-all hover:bg-gray-700 hover:text-white hover:scale-110 flex-shrink-0"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        
        <div className="p-6">
          <p 
            className="m-0 text-white leading-relaxed text-[0.95rem] whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formatMessage(alert.message) || 'No message provided.' }}
          />
        </div>
        
        <div className="flex gap-3 p-4 pt-0 border-t border-gray-800 justify-end">
          {alert.type === 'confirm' && (
            <button
              onClick={handleCancel}
              className="px-5 py-2.5 rounded-lg font-semibold text-sm cursor-pointer transition-all min-w-[100px] bg-[#2b2b40] text-white border border-gray-700 hover:bg-gray-700"
            >
              <i className="fas fa-times mr-2"></i>
              {alert.cancelText || 'Cancel'}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm cursor-pointer transition-all min-w-[100px] flex items-center justify-center hover:shadow-lg hover:-translate-y-0.5 ${buttonClasses[alert.type]}`}
          >
            <i className="fas fa-check mr-2"></i>
            {alert.confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default AlertModal

