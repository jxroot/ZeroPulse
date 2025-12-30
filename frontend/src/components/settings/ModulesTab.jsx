import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadModules, createModule, updateModule, deleteModule, executeModule } from '../../store/slices/settingsSlice'
import { formatDate } from '../../utils/helpers'
import { extractVariables, replaceVariables } from '../../utils/templateEngine'
import { alertSuccess, alertError, confirm } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'
import ModuleEditorModal from './ModuleEditorModal'
import VariableInputModal from './VariableInputModal'

const ModulesTab = () => {
  const dispatch = useDispatch()
  const settings = useSelector(state => state.settings)
  const tunnels = useSelector(state => state.tunnels.tunnels)
  
  const [expandedModules, setExpandedModules] = useState({})
  const [selectedTunnelForModule, setSelectedTunnelForModule] = useState({})
  const [isModuleEditorOpen, setIsModuleEditorOpen] = useState(false)
  const [editingModule, setEditingModule] = useState(null)
  const [showVariableInputModal, setShowVariableInputModal] = useState(false)
  const [moduleVariables, setModuleVariables] = useState([])
  const [variableValues, setVariableValues] = useState({})
  const [moduleToExecute, setModuleToExecute] = useState(null)

  useEffect(() => {
    if (!settings.modulesLoaded && !settings.loading) {
      dispatch(loadModules())
    }
    // Single user system - no permission checks needed
  }, [dispatch, settings.modulesLoaded, settings.loading])

  const toggleModule = (moduleId) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }))
  }

  const openModuleEditor = (module) => {
    if (module) {
      setEditingModule(module)
    } else {
      setEditingModule(null)
    }
    setIsModuleEditorOpen(true)
  }

  const closeModuleEditor = () => {
    setIsModuleEditorOpen(false)
    setEditingModule(null)
  }

  const handleSaveModule = async (moduleData) => {
    try {
      if (editingModule) {
        await dispatch(updateModule({ moduleId: editingModule.id, moduleData })).unwrap()
        alertSuccess('Module updated successfully', 'Success')
      } else {
        await dispatch(createModule(moduleData)).unwrap()
        alertSuccess('Module created successfully', 'Success')
      }
      closeModuleEditor()
    } catch (err) {
      alertError(err || 'Failed to save module', 'Error')
    }
  }

  const handleDeleteModule = async (moduleId) => {
    const confirmed = await confirm('Are you sure you want to delete this module?', 'Delete Module')
    if (!confirmed) return
    
    try {
      await dispatch(deleteModule(moduleId)).unwrap()
      alertSuccess('Module deleted successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to delete module', 'Error')
    }
  }

  const handleExecuteModule = async (moduleId, tunnelId) => {
    if (!tunnelId) {
      alertError('Please select a tunnel first', 'Tunnel Required')
      return
    }
    
    const module = settings.modules.find(m => m.id === moduleId)
    if (!module) {
      alertError('Module not found', 'Error')
      return
    }
    
    // Extract variables from script
    const variables = extractVariables(module.script || '')
    
    if (variables.length > 0) {
      // Show variable input modal
      setModuleVariables(variables)
      setVariableValues({})
      setModuleToExecute({ ...module, tunnelId })
      setShowVariableInputModal(true)
    } else {
      // No variables, execute directly
      try {
        const result = await dispatch(executeModule({ moduleId, tunnelId })).unwrap()
        alertSuccess(
          `Output:\n${result.output || 'No output'}`,
          'Module Executed Successfully'
        )
      } catch (err) {
        alertError(err || 'Failed to execute module', 'Execution Error')
      }
    }
  }

  const handleConfirmVariableInput = async () => {
    if (!moduleToExecute) return
    
    // Replace variables in script
    const replacedScript = replaceVariables(moduleToExecute.script, variableValues)
    
    // Execute module with replaced script
    try {
      const result = await dispatch(executeModule({ 
        moduleId: moduleToExecute.id, 
        tunnelId: moduleToExecute.tunnelId, 
        script: replacedScript 
      })).unwrap()
      alertSuccess(
        `Output:\n${result.output || 'No output'}`,
        'Module Executed Successfully'
      )
      setShowVariableInputModal(false)
      setVariableValues({})
      setModuleToExecute(null)
    } catch (err) {
      alertError(err || 'Failed to execute module', 'Execution Error')
    }
  }

  const getModuleScriptStats = (module) => {
    const script = module?.script || ''
    return {
      characters: script.length,
      lines: script.split('\n').length
    }
  }

  if (settings.loading && settings.modules.length === 0) {
    return (
      <div className="text-center py-10">
        <LoadingSpinner message="Loading modules..." />
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>PowerShell Modules</h4>
        <button
          onClick={() => openModuleEditor(null)}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
        >
          <i className="fas fa-plus"></i>
          New Module
        </button>
      </div>

      {settings.modules.length === 0 ? (
        <div className="text-center py-10">
          <i className="fas fa-cube text-5xl opacity-50 mb-4" style={{ color: 'var(--text-secondary)' }}></i>
          <h3 className="m-0 mb-2.5" style={{ color: 'var(--text-primary)' }}>No modules found</h3>
          <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>Create your first PowerShell module</p>
        </div>
      ) : (
        <div className="space-y-3">
          {settings.modules.map((module) => (
            <div
              key={module.id}
              className="rounded-lg overflow-hidden"
              style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}
            >
              {/* Header */}
              <div 
                onClick={() => toggleModule(module.id)}
                className="flex justify-between items-center p-4 cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--bg-quaternary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'
                }}
              >
                <div className="flex items-center gap-3 flex-1">
                  <i 
                    className={`fas transition-transform duration-200 text-purple-400 ${
                      expandedModules[module.id] ? 'fa-chevron-down' : 'fa-chevron-right'
                    }`}
                  ></i>
                  <div className="flex-1">
                    <h5 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{module.name}</h5>
                    {module.description && (
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{module.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span><i className="fas fa-calendar mr-1"></i> {formatDate(module.created_at)}</span>
                  {module.updated_at && (
                    <span><i className="fas fa-edit mr-1"></i> {formatDate(module.updated_at)}</span>
                  )}
                </div>
              </div>
              
              {/* Collapsible Content */}
              {expandedModules[module.id] && (
                <div className="border-t p-4" style={{ borderTopColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <div className="flex gap-2 items-center mb-3">
                    <select
                      value={selectedTunnelForModule[module.id] || ''}
                      onChange={(e) => setSelectedTunnelForModule(prev => ({
                        ...prev,
                        [module.id]: e.target.value
                      }))}
                      className="px-3 py-1.5 rounded text-xs focus:outline-none focus:border-purple-500"
                      style={{ 
                        backgroundColor: 'var(--bg-secondary)', 
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)',
                        border: '1px solid'
                      }}
                    >
                      <option value="">Select Tunnel...</option>
                      {tunnels.map(tunnel => (
                        <option key={tunnel.id} value={tunnel.id}>
                          {tunnel.id} ({tunnel.status})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleExecuteModule(module.id, selectedTunnelForModule[module.id])}
                      disabled={!selectedTunnelForModule[module.id]}
                      className="px-3 py-1.5 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="fas fa-play mr-1"></i>
                      Execute
                    </button>
                    <>
                      <button
                        onClick={() => openModuleEditor(module)}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
                      >
                        <i className="fas fa-edit mr-1"></i>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteModule(module.id)}
                          className="px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
                        >
                          <i className="fas fa-trash mr-1"></i>
                          Delete
                        </button>
                      </>
                  </div>
                  {module.script && (
                    <div className="rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                      <div className="flex justify-between items-center px-3 py-2 border-b" style={{ backgroundColor: 'var(--bg-quaternary)', borderBottomColor: 'var(--border-color)' }}>
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <i className="fab fa-windows text-purple-400"></i>
                          <span>PowerShell Script</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span><i className="fas fa-font mr-1"></i>{getModuleScriptStats(module).characters} characters</span>
                          <span><i className="fas fa-bars mr-1"></i>{getModuleScriptStats(module).lines} lines</span>
                        </div>
                      </div>
                      <div className="p-3 max-h-[300px] overflow-auto" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap m-0" style={{ color: 'var(--text-primary)' }}>{module.script}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {settings.modulesError && (
        <div className="mt-4 bg-red-500/20 text-red-400 p-4 rounded-lg border border-red-500/30">
          Error: {settings.modulesError}
        </div>
      )}

      {/* Template Engine Help Section */}
      <div className="mt-6 rounded-lg p-5" style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2 mb-4">
          <i className="fas fa-info-circle text-purple-400 text-lg"></i>
          <h4 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>Template Engine Guide</h4>
        </div>
        <div className="text-sm space-y-3" style={{ color: 'var(--text-secondary)' }}>
          <p className="m-0">You can use variables in your PowerShell scripts with the following formats:</p>
          
          <div className="rounded p-3 font-mono text-xs" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div className="mb-2">
              <span className="text-purple-400">1. Simple Text:</span>
              <code className="block mt-1 text-green-400">{'ping _{ip,192.168.1.1}_'}</code>
              <span className="text-xs mt-1 block" style={{ color: 'var(--text-secondary)' }}>Title: ip | Placeholder: 192.168.1.1</span>
            </div>
            
            <div className="mb-2">
              <span className="text-purple-400">2. Dropdown List:</span>
              <code className="block mt-1 text-green-400">{'ping _{ip,list,(192.168.1.1,192.168.1.2,10.0.0.1)}_'}</code>
              <span className="text-xs mt-1 block" style={{ color: 'var(--text-secondary)' }}>Title: ip | Type: Dropdown with options</span>
            </div>
            
            <div className="mb-2">
              <span className="text-purple-400">3. Radio Buttons:</span>
              <code className="block mt-1 text-green-400">{'ping _{port,radio,(80,443,8080)}_'}</code>
              <span className="text-xs mt-1 block" style={{ color: 'var(--text-secondary)' }}>Title: port | Type: Radio buttons</span>
            </div>
            
            <div>
              <span className="text-purple-400">4. Checkbox:</span>
              <code className="block mt-1 text-green-400">{'ping _{enable,check,(true,false),Enabled,Disabled}_'}</code>
              <span className="text-xs mt-1 block" style={{ color: 'var(--text-secondary)' }}>Title: enable | Type: Checkbox | Placeholders: Enabled/Disabled</span>
            </div>
          </div>
          
          <p className="m-0 text-xs">
            <i className="fas fa-lightbulb text-yellow-400 mr-1"></i>
            <strong>Tip:</strong> When executing a module, you'll be prompted to enter values for all variables before execution.
          </p>
        </div>
      </div>

      {/* Module Editor Modal */}
      {isModuleEditorOpen && (
        <ModuleEditorModal
          module={editingModule}
          onClose={closeModuleEditor}
          onSave={handleSaveModule}
        />
      )}

      {/* Variable Input Modal */}
      {showVariableInputModal && moduleToExecute && (
        <VariableInputModal
          module={moduleToExecute}
          variables={moduleVariables}
          values={variableValues}
          onValuesChange={setVariableValues}
          onConfirm={handleConfirmVariableInput}
          onCancel={() => {
            setShowVariableInputModal(false)
            setVariableValues({})
            setModuleToExecute(null)
          }}
        />
      )}
    </>
  )
}

export default ModulesTab

