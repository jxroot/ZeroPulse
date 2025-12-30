import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createPortal } from 'react-dom'
import {
  loadModuleStructure,
  createCategory,
  updateCategory,
  deleteCategory,
  setDefaultCategory,
  createSection,
  updateSection,
  deleteSection,
  createItem,
  updateItem,
  deleteItem,
  exportStructure,
  toggleCategory,
  toggleSection,
  openCategoryModal,
  closeCategoryModal,
  openSectionModal,
  closeSectionModal,
  openItemModal,
  closeItemModal,
  updateCategoryForm,
  updateSectionForm,
  updateItemForm
} from '../../store/slices/moduleControlSlice'
import { alertSuccess, alertError, confirm } from '../../utils/alert'
import LoadingSpinner from '../common/LoadingSpinner'

const ModuleControlTab = () => {
  const dispatch = useDispatch()
  const moduleControl = useSelector(state => state.moduleControl)
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  const {
    categories,
    sections,
    items,
    loading,
    error,
    structureLoaded,
    expandedCategories,
    expandedSections,
    showCategoryModal,
    showSectionModal,
    showItemModal,
    editingCategory,
    editingSection,
    editingItem,
    categoryForm,
    sectionForm,
    itemForm
  } = moduleControl

  useEffect(() => {
    if (!structureLoaded && !loading) {
      dispatch(loadModuleStructure())
    }
  }, [dispatch, structureLoaded, loading])

  const getSectionsByCategory = (categoryId) => {
    return sections.filter(s => s.category_id === categoryId)
  }

  const getItemsBySection = (sectionId) => {
    return items.filter(i => i.section_id === sectionId)
  }

  const getCategoryLabel = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId)
    return cat ? cat.label : 'Unknown'
  }

  const handleSaveCategory = async () => {
    if (!categoryForm.name || !categoryForm.label) {
      alertError('Please fill in all required fields', 'Validation Error')
      return
    }

    try {
      if (editingCategory) {
        await dispatch(updateCategory({ categoryId: editingCategory.id, categoryData: categoryForm })).unwrap()
        alertSuccess('Category updated successfully', 'Success')
      } else {
        await dispatch(createCategory(categoryForm)).unwrap()
        alertSuccess('Category created successfully', 'Success')
      }
      dispatch(closeCategoryModal())
    } catch (err) {
      alertError(err || 'Failed to save category', 'Error')
    }
  }

  const handleSaveSection = async () => {
    if (!sectionForm.category_id || !sectionForm.name || !sectionForm.label) {
      alertError('Please fill in all required fields', 'Validation Error')
      return
    }

    try {
      if (editingSection) {
        await dispatch(updateSection({ sectionId: editingSection.id, sectionData: sectionForm })).unwrap()
        alertSuccess('Section updated successfully', 'Success')
      } else {
        await dispatch(createSection(sectionForm)).unwrap()
        alertSuccess('Section created successfully', 'Success')
      }
      dispatch(closeSectionModal())
    } catch (err) {
      alertError(err || 'Failed to save section', 'Error')
    }
  }

  const handleSaveItem = async () => {
    if (!itemForm.section_id || !itemForm.name || !itemForm.label || !itemForm.command) {
      alertError('Please fill in all required fields', 'Validation Error')
      return
    }

    try {
      if (editingItem) {
        await dispatch(updateItem({ itemId: editingItem.id, itemData: itemForm })).unwrap()
        alertSuccess('Item updated successfully', 'Success')
      } else {
        await dispatch(createItem(itemForm)).unwrap()
        alertSuccess('Item created successfully', 'Success')
      }
      dispatch(closeItemModal())
    } catch (err) {
      alertError(err || 'Failed to save item', 'Error')
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    const confirmed = await confirm(
      'Are you sure you want to delete this category? All sections and items will be deleted.',
      'Delete Category'
    )
    if (!confirmed) return

    try {
      await dispatch(deleteCategory(categoryId)).unwrap()
      alertSuccess('Category deleted successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to delete category', 'Error')
    }
  }

  const handleDeleteSection = async (sectionId) => {
    const confirmed = await confirm(
      'Are you sure you want to delete this section? All items will be deleted.',
      'Delete Section'
    )
    if (!confirmed) return

    try {
      await dispatch(deleteSection(sectionId)).unwrap()
      alertSuccess('Section deleted successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to delete section', 'Error')
    }
  }

  const handleDeleteItem = async (itemId) => {
    const confirmed = await confirm('Are you sure you want to delete this item?', 'Delete Item')
    if (!confirmed) return

    try {
      await dispatch(deleteItem(itemId)).unwrap()
      alertSuccess('Item deleted successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to delete item', 'Error')
    }
  }

  const handleSetDefaultCategory = async (categoryId) => {
    try {
      await dispatch(setDefaultCategory(categoryId)).unwrap()
      alertSuccess('Default category set successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to set default category', 'Error')
    }
  }

  const handleExport = async () => {
    try {
      const structure = await dispatch(exportStructure()).unwrap()
      const dataStr = JSON.stringify(structure, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `module-structure-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
      alertSuccess('Module structure exported successfully', 'Success')
    } catch (err) {
      alertError(err || 'Failed to export structure', 'Error')
    }
  }

  const handleImport = () => {
    alertError('Import functionality coming soon', 'Not Implemented')
  }

  if (loading && categories.length === 0) {
    return (
      <div className="text-center py-10">
        <LoadingSpinner message="Loading module structure..." />
      </div>
    )
  }

  return (
    <>
      {/* Header with Actions */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h4 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Module Control Panel Manager</h4>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Manage categories, sections, and module items dynamically</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => dispatch(loadModuleStructure())}
            className="w-9 h-9 flex items-center justify-center bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/25 transition-colors"
            title="Refresh">
            <i className="fas fa-sync-alt"></i>
          </button>
          <button
            onClick={handleImport}
            className="w-9 h-9 flex items-center justify-center bg-blue-500/15 border border-blue-500/30 rounded-lg text-blue-400 hover:bg-blue-500/25 transition-colors"
            title="Import"
          >
            <i className="fas fa-file-import"></i>
          </button>
          <button
            onClick={handleExport}
            className="w-9 h-9 flex items-center justify-center bg-yellow-500/15 border border-yellow-500/30 rounded-lg text-yellow-400 hover:bg-yellow-500/25 transition-colors"
            title="Export"
          >
            <i className="fas fa-file-export"></i>
          </button>
          <button
            onClick={() => dispatch(openCategoryModal(null))}
            className="w-9 h-9 flex items-center justify-center bg-green-500/15 border border-green-500/30 rounded-lg text-green-400 hover:bg-green-500/25 transition-colors"
            title="New Category"
          >
            <i className="fas fa-plus"></i>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/20 text-red-400 p-4 rounded-lg border border-red-500/30">
          Error: {error}
        </div>
      )}

      {/* Categories List */}
      <div className="space-y-4">
        {categories.map((category) => (
          <div
            key={category.id}
            className="border-2 rounded-lg overflow-hidden"
            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
            
            {/* Category Header */}
            <div className="flex items-center justify-between p-4" style={{ background: 'linear-gradient(to right, rgba(102, 126, 234, 0.1), transparent)' }}>
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => dispatch(toggleCategory(category.id))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <i 
                    className={`fas transition-transform duration-200 ${
                      expandedCategories[category.id] ? 'fa-chevron-down' : 'fa-chevron-right'
                    }`}
                    style={{ color: 'var(--accent-primary)' }}></i>
                </button>
                <i className={`${category.icon} text-2xl`} style={{ color: 'var(--accent-primary)' }}></i>
                <div className="flex-1">
                  <h5 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{category.label}</h5>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{category.name} • Order: {category.order_index}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: category.is_active ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)',
                      color: category.is_active ? 'var(--success)' : 'var(--danger)'
                    }}>
                    {category.is_active ? 'Active' : 'Inactive'}
                  </div>
                  {category.is_default === 1 || category.is_default === true ? (
                    <button
                      className="px-3 py-1 rounded-full text-xs font-semibold cursor-default"
                      style={{ backgroundColor: 'rgba(102, 126, 234, 0.2)', color: 'var(--accent-primary)' }}
                      title="Default Category">
                      <i className="fas fa-star mr-1"></i> Default
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSetDefaultCategory(category.id)}
                      className="px-3 py-1 rounded text-xs font-semibold transition-colors"
                      style={{ 
                        backgroundColor: 'rgba(102, 126, 234, 0.1)', 
                        color: 'var(--accent-primary)' 
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.2)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.1)'}
                      title="Set as Default Category">
                      <i className="far fa-star mr-1"></i> Set Default
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => dispatch(openSectionModal({ section: null, categoryId: category.id }))}
                  className="px-3 py-1.5 bg-[#667eea] text-white rounded-lg hover:bg-[#5568d3] transition-colors text-sm">
                  <i className="fas fa-plus mr-1"></i> Section
                </button>
                <button
                  onClick={() => dispatch(openCategoryModal(category))}
                  className="px-3 py-1.5 bg-[#ffc107] text-black rounded-lg hover:bg-[#e0a800] transition-colors text-sm">
                  <i className="fas fa-edit"></i>
                </button>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  className="px-3 py-1.5 bg-[#dc3545] text-white rounded-lg hover:bg-[#c82333] transition-colors text-sm">
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            </div>

            {/* Sections (Collapsible) */}
            {expandedCategories[category.id] && (
              <div className="p-4 space-y-3">
                {getSectionsByCategory(category.id).map((section) => (
                  <div
                    key={section.id}
                    className="border rounded-lg overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    
                    {/* Section Header */}
                    <div className="flex items-center justify-between p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          onClick={() => dispatch(toggleSection(section.id))}
                          className="w-7 h-7 flex items-center justify-center rounded transition-colors"
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                          <i 
                            className={`fas text-sm transition-transform duration-200 ${
                              expandedSections[section.id] ? 'fa-chevron-down' : 'fa-chevron-right'
                            }`}
                            style={{ color: 'var(--accent-primary)' }}></i>
                        </button>
                        {section.icon && <i className={`${section.icon}`} style={{ color: 'var(--accent-primary)' }}></i>}
                        <div className="flex-1">
                          <h6 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{section.label}</h6>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{section.name} • Order: {section.order_index}</p>
                        </div>
                        <div 
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{
                            backgroundColor: section.is_active ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)',
                            color: section.is_active ? 'var(--success)' : 'var(--danger)'
                          }}>
                          {section.is_active ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          onClick={() => dispatch(openItemModal({ item: null, sectionId: section.id }))}
                          className="px-2 py-1 bg-[#667eea] text-white rounded text-xs hover:bg-[#5568d3] transition-colors">
                          <i className="fas fa-plus mr-1"></i> Item
                        </button>
                        <button
                          onClick={() => dispatch(openSectionModal({ section, categoryId: category.id }))}
                          className="px-2 py-1 bg-[#ffc107] text-black rounded text-xs hover:bg-[#e0a800] transition-colors">
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteSection(section.id)}
                          className="px-2 py-1 bg-[#dc3545] text-white rounded text-xs hover:bg-[#c82333] transition-colors">
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>

                    {/* Items (Collapsible) */}
                    {expandedSections[section.id] && (
                      <div className="p-3 space-y-2">
                        {getItemsBySection(section.id).map((item) => (
                          <div
                            key={item.id}
                            className="border rounded-lg p-3"
                            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {item.icon && <i className={`${item.icon}`} style={{ color: 'var(--accent-primary)' }}></i>}
                                <div className="flex-1">
                                  <h6 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</h6>
                                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.name}</p>
                                  {item.description && (
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{item.description}</p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs" style={{ color: 'var(--accent-primary)' }}>{item.execution_type}</span>
                                    {item.requires_admin && (
                                      <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(220, 53, 69, 0.2)', color: 'var(--danger)' }}>
                                        <i className="fas fa-shield-alt"></i> Admin
                                      </span>
                                    )}
                                    <span 
                                      className="px-2 py-0.5 rounded text-xs"
                                      style={{
                                        backgroundColor: item.is_active ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)',
                                        color: item.is_active ? 'var(--success)' : 'var(--danger)'
                                      }}>
                                      {item.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => dispatch(openItemModal({ item, sectionId: section.id }))}
                                  className="px-2 py-1 bg-[#ffc107] text-black rounded text-xs hover:bg-[#e0a800] transition-colors">
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="px-2 py-1 bg-[#dc3545] text-white rounded text-xs hover:bg-[#c82333] transition-colors">
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {getItemsBySection(section.id).length === 0 && (
                          <div className="text-center py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <i className="fas fa-inbox opacity-50 mb-2" style={{ color: 'var(--text-tertiary)' }}></i>
                            <p style={{ color: 'var(--text-secondary)' }}>No items in this section</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {getSectionsByCategory(category.id).length === 0 && (
                  <div className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                    <i className="fas fa-folder-open text-3xl opacity-50 mb-2" style={{ color: 'var(--text-tertiary)' }}></i>
                    <p style={{ color: 'var(--text-secondary)' }}>No sections in this category</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {categories.length === 0 && (
          <div className="text-center py-10">
            <i className="fas fa-th-large text-5xl opacity-50 mb-4" style={{ color: 'var(--text-tertiary)' }}></i>
            <h3 className="m-0 mb-2.5" style={{ color: 'var(--text-primary)' }}>No categories found</h3>
            <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>Create your first category to start building the module structure</p>
          </div>
        )}
      </div>

      {/* Category Form Modal */}
      {showCategoryModal && createPortal(
        <div 
          className="fixed z-[1100] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
        >
          <div 
            className="p-6 rounded-xl w-full border-2 overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--accent-primary)',
              maxWidth: '90vw',
              maxHeight: '90vh'
            }}
          >
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                <i className="fas fa-folder mr-2" style={{ color: 'var(--accent-primary)' }}></i>
                {editingCategory ? 'Edit Category' : 'New Category'}
              </h3>
              <button 
                onClick={() => dispatch(closeCategoryModal())} 
                className="text-2xl transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Name (Internal)</label>
                <input 
                  value={categoryForm.name}
                  onChange={(e) => dispatch(updateCategoryForm({ name: e.target.value }))}
                  type="text"
                  placeholder="e.g., system, network"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Label (Display)</label>
                <input 
                  value={categoryForm.label}
                  onChange={(e) => dispatch(updateCategoryForm({ label: e.target.value }))}
                  type="text"
                  placeholder="e.g., System, Network"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Icon (Font Awesome)</label>
                <input 
                  value={categoryForm.icon}
                  onChange={(e) => dispatch(updateCategoryForm({ icon: e.target.value }))}
                  type="text"
                  placeholder="e.g., fas fa-desktop"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Preview: <i className={categoryForm.icon}></i></p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Order</label>
                  <input 
                    value={categoryForm.order_index}
                    onChange={(e) => dispatch(updateCategoryForm({ order_index: parseInt(e.target.value) || 0 }))}
                    type="number"
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Status</label>
                  <select 
                    value={categoryForm.is_active ? 'true' : 'false'}
                    onChange={(e) => dispatch(updateCategoryForm({ is_active: e.target.value === 'true' }))}
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6 flex-shrink-0">
              <button
                onClick={() => dispatch(closeCategoryModal())}
                className="flex-1 px-4 py-3 rounded-lg transition-colors"
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
              <button
                onClick={handleSaveCategory}
                className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <i className="fas fa-save mr-2"></i>
                {editingCategory ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Section Form Modal */}
      {showSectionModal && createPortal(
        <div 
          className="fixed z-[1100] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
        >
          <div 
            className="p-6 rounded-xl w-full border-2 overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--accent-primary)',
              maxWidth: '90vw',
              maxHeight: '90vh'
            }}
          >
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                <i className="fas fa-layer-group mr-2" style={{ color: 'var(--accent-primary)' }}></i>
                {editingSection ? 'Edit Section' : 'New Section'}
              </h3>
              <button 
                onClick={() => dispatch(closeSectionModal())} 
                className="text-2xl transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Category</label>
                <select 
                  value={sectionForm.category_id}
                  onChange={(e) => dispatch(updateSectionForm({ category_id: e.target.value }))}
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <option value="">Select Category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Name (Internal)</label>
                <input 
                  value={sectionForm.name}
                  onChange={(e) => dispatch(updateSectionForm({ name: e.target.value }))}
                  type="text"
                  placeholder="e.g., system_information"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Label (Display)</label>
                <input 
                  value={sectionForm.label}
                  onChange={(e) => dispatch(updateSectionForm({ label: e.target.value }))}
                  type="text"
                  placeholder="e.g., System Information"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Icon (Optional)</label>
                <input 
                  value={sectionForm.icon}
                  onChange={(e) => dispatch(updateSectionForm({ icon: e.target.value }))}
                  type="text"
                  placeholder="e.g., fas fa-info-circle"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Preview: <i className={sectionForm.icon}></i></p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Order</label>
                  <input 
                    value={sectionForm.order_index}
                    onChange={(e) => dispatch(updateSectionForm({ order_index: parseInt(e.target.value) || 0 }))}
                    type="number"
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Status</label>
                  <select 
                    value={sectionForm.is_active ? 'true' : 'false'}
                    onChange={(e) => dispatch(updateSectionForm({ is_active: e.target.value === 'true' }))}
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6 flex-shrink-0">
              <button
                onClick={() => dispatch(closeSectionModal())}
                className="flex-1 px-4 py-3 rounded-lg transition-colors"
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
              <button
                onClick={handleSaveSection}
                className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <i className="fas fa-save mr-2"></i>
                {editingSection ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Item Form Modal */}
      {showItemModal && createPortal(
        <div 
          className="fixed z-[1100] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
        >
          <div 
            className="p-6 rounded-xl w-full border-2 overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--accent-primary)',
              maxWidth: '90vw',
              maxHeight: '90vh'
            }}
          >
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                <i className="fas fa-cube mr-2" style={{ color: 'var(--accent-primary)' }}></i>
                {editingItem ? 'Edit Module Item' : 'New Module Item'}
              </h3>
              <button 
                onClick={() => dispatch(closeItemModal())} 
                className="text-2xl transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Section</label>
                <select 
                  value={itemForm.section_id}
                  onChange={(e) => dispatch(updateItemForm({ section_id: e.target.value }))}
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <option value="">Select Section...</option>
                  {sections.map(sec => (
                    <option key={sec.id} value={sec.id}>
                      {sec.label} ({getCategoryLabel(sec.category_id)})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Name (Internal)</label>
                  <input 
                    value={itemForm.name}
                    onChange={(e) => dispatch(updateItemForm({ name: e.target.value }))}
                    type="text"
                    placeholder="e.g., get_system_info"
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Label (Display)</label>
                  <input 
                    value={itemForm.label}
                    onChange={(e) => dispatch(updateItemForm({ label: e.target.value }))}
                    type="text"
                    placeholder="e.g., Get System Info"
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Icon (Optional)</label>
                <input 
                  value={itemForm.icon}
                  onChange={(e) => dispatch(updateItemForm({ icon: e.target.value }))}
                  type="text"
                  placeholder="e.g., fas fa-server"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Preview: <i className={itemForm.icon}></i></p>
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Command</label>
                <textarea 
                  value={itemForm.command}
                  onChange={(e) => dispatch(updateItemForm({ command: e.target.value }))}
                  rows="6"
                  placeholder="Enter PowerShell or CMD command..."
                  className="w-full p-3 border rounded-lg font-mono text-sm focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                ></textarea>
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Description (Optional)</label>
                <input 
                  value={itemForm.description}
                  onChange={(e) => dispatch(updateItemForm({ description: e.target.value }))}
                  type="text"
                  placeholder="Brief description shown as tooltip"
                  className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
              
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Execution Type</label>
                  <select 
                    value={itemForm.execution_type}
                    onChange={(e) => dispatch(updateItemForm({ execution_type: e.target.value }))}
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <option value="powershell">PowerShell</option>
                    <option value="cmd">CMD</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Order</label>
                  <input 
                    value={itemForm.order_index}
                    onChange={(e) => dispatch(updateItemForm({ order_index: parseInt(e.target.value) || 0 }))}
                    type="number"
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Status</label>
                  <select 
                    value={itemForm.is_active ? 'true' : 'false'}
                    onChange={(e) => dispatch(updateItemForm({ is_active: e.target.value === 'true' }))}
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Requires Admin</label>
                  <select 
                    value={itemForm.requires_admin ? 'true' : 'false'}
                    onChange={(e) => dispatch(updateItemForm({ requires_admin: e.target.value === 'true' }))}
                    className="w-full p-3 border rounded-lg focus:outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6 flex-shrink-0">
              <button
                onClick={() => dispatch(closeItemModal())}
                className="flex-1 px-4 py-3 rounded-lg transition-colors"
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
              <button
                onClick={handleSaveItem}
                className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <i className="fas fa-save mr-2"></i>
                {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default ModuleControlTab
