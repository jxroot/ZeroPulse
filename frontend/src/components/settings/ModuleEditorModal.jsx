import { useState, useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { createPortal } from 'react-dom'

const ModuleEditorModal = ({ module, onClose, onSave }) => {
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    script: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (module) {
      setFormData({
        name: module.name || '',
        description: module.description || '',
        script: module.script || ''
      })
    } else {
      setFormData({
        name: '',
        description: '',
        script: ''
      })
    }
  }, [module])

  const scriptStats = useMemo(() => {
    const script = formData.script || ''
    return {
      characters: script.length,
      lines: script.split('\n').length
    }
  }, [formData.script])

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.script.trim()) {
      return
    }
    setLoading(true)
    try {
      await onSave(formData)
    } finally {
      setLoading(false)
    }
  }

  const modalContent = (
    <div 
      className="fixed z-[1001] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
    >
      <div 
        className="rounded-xl w-full shadow-2xl border overflow-hidden my-4"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: 'var(--border-color)',
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="bg-gradient-to-r from-purple-600 to-blue-500 text-white p-5 flex justify-between items-center flex-shrink-0">
          <h3 className="m-0 text-xl font-semibold">{module ? 'Edit Module' : 'New Module'}</h3>
          <button
            onClick={onClose}
            className="text-white text-2xl font-bold cursor-pointer transition-transform duration-200 hover:scale-125 hover:text-red-200"
          >
            &times;
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <div className="mb-4">
            <label className="block mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>Name:</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Module name"
              className="w-full p-2.5 border-2 rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>Description:</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Module description"
              className="w-full p-2.5 border-2 rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            />
          </div>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block font-medium" style={{ color: 'var(--text-primary)' }}>PowerShell Script:</label>
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span><i className="fas fa-font mr-1"></i>{scriptStats.characters} characters</span>
                <span><i className="fas fa-bars mr-1"></i>{scriptStats.lines} lines</span>
              </div>
            </div>
            <div className="border-2 rounded-lg overflow-hidden" style={{ 
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)'
            }}>
              <div className="flex justify-between items-center px-3 py-2 border-b" style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)'
              }}>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <i className="fab fa-windows" style={{ color: 'var(--accent-primary)' }}></i>
                  <span>PowerShell Script</span>
                </div>
              </div>
              <textarea
                value={formData.script}
                onChange={(e) => setFormData(prev => ({ ...prev, script: e.target.value }))}
                rows={15}
                placeholder="Enter PowerShell script here..."
                className="w-full p-2.5 font-mono text-sm focus:outline-none focus:ring-0 resize-y border-none"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  minHeight: '300px'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = 'none'
                }}
              />
            </div>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={loading || !formData.name.trim() || !formData.script.trim()}
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className="fas fa-save mr-2"></i>
              Save
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: isLightMode ? '#6c757d' : '#4e5560',
                color: '#ffffff'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isLightMode ? '#5a6268' : '#3d4248'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isLightMode ? '#6c757d' : '#4e5560'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ModuleEditorModal

