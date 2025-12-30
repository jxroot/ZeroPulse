import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'

const VariableInputModal = ({ module, variables, values, onValuesChange, onConfirm, onCancel }) => {
  const allVariablesFilled = useMemo(() => {
    return variables.every(v => values[v.name] && values[v.name].toString().trim() !== '')
  }, [variables, values])

  const handleValueChange = (varName, value) => {
    onValuesChange(prev => ({
      ...prev,
      [varName]: value
    }))
  }

  const modalContent = (
    <div className="fixed z-[1001] left-0 top-0 w-full h-full bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#2b2b40] rounded-xl w-full max-w-[500px] shadow-2xl border border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-500 text-white p-5 flex justify-between items-center">
          <h3 className="m-0 text-xl font-semibold">Enter Module Variables</h3>
          <button
            onClick={onCancel}
            className="text-white text-2xl font-bold cursor-pointer transition-transform duration-200 hover:scale-125 hover:text-red-200"
          >
            &times;
          </button>
        </div>
        <div className="p-6 bg-[#2b2b40]">
          {module && (
            <div className="mb-4">
              <p className="text-white text-sm mb-4">
                Module: <strong>{module.name}</strong>
              </p>
            </div>
          )}
          <div className="space-y-4">
            {variables.map((variable) => (
              <div key={variable.name} className="mb-4">
                <label className="block mb-2 text-white text-sm font-medium">
                  {variable.name}
                </label>
                
                {/* Text Input */}
                {variable.type === 'text' && (
                  <input
                    type="text"
                    value={values[variable.name] || ''}
                    onChange={(e) => handleValueChange(variable.name, e.target.value)}
                    placeholder={variable.placeholder}
                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                    onKeyUp={(e) => {
                      if (e.key === 'Enter' && allVariablesFilled) {
                        onConfirm()
                      }
                    }}
                  />
                )}
                
                {/* Dropdown List */}
                {variable.type === 'list' && (
                  <select
                    value={values[variable.name] || ''}
                    onChange={(e) => handleValueChange(variable.name, e.target.value)}
                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="">{variable.placeholder || 'Select...'}</option>
                    {variable.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
                
                {/* Radio Buttons */}
                {variable.type === 'radio' && (
                  <div className="flex gap-4">
                    {variable.options.map((option) => (
                      <label key={option} className="inline-flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name={`var-${variable.name}`}
                          value={option}
                          checked={values[variable.name] === option}
                          onChange={(e) => handleValueChange(variable.name, e.target.value)}
                          className="hidden"
                        />
                        <span className={`px-4 py-2 rounded-lg border-2 transition-all duration-200 flex items-center gap-2 ${
                          values[variable.name] === option
                            ? 'border-purple-500 bg-gray-800 text-white'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-purple-500'
                        }`}>
                          {option}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                
                {/* Checkbox */}
                {variable.type === 'checkbox' && (
                  <div className="flex gap-4">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={values[variable.name] === (variable.options[0] || 'true')}
                        onChange={(e) => handleValueChange(
                          variable.name,
                          e.target.checked ? (variable.options[0] || 'true') : (variable.options[1] || 'false')
                        )}
                        className="hidden"
                      />
                      <span className={`px-4 py-2 rounded-lg border-2 transition-all duration-200 flex items-center gap-2 ${
                        values[variable.name] === (variable.options[0] || 'true')
                          ? 'border-purple-500 bg-gray-800 text-white'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-purple-500'
                      }`}>
                        <i className={`fas ${values[variable.name] === (variable.options[0] || 'true') ? 'fa-check-square' : 'far fa-square'}`}></i>
                        {values[variable.name] === (variable.options[0] || 'true')
                          ? (variable.placeholder || 'Yes')
                          : (variable.placeholder2 || 'No')}
                      </span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!allVariablesFilled}
              className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Execute
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default VariableInputModal

