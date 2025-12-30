import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

// Async Thunks
export const loadModuleStructure = createAsyncThunk(
  'moduleControl/loadModuleStructure',
  async (_, { rejectWithValue }) => {
    try {
      const [categoriesRes, sectionsRes, itemsRes] = await Promise.all([
        api.get('/module-control/categories?active_only=false'),
        api.get('/module-control/sections?active_only=false'),
        api.get('/module-control/items?active_only=false')
      ])
      
      if (categoriesRes.data.success && sectionsRes.data.success && itemsRes.data.success) {
        return {
          categories: categoriesRes.data.categories || [],
          sections: sectionsRes.data.sections || [],
          items: itemsRes.data.items || []
        }
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to load module structure')
    }
  }
)

export const createCategory = createAsyncThunk(
  'moduleControl/createCategory',
  async (categoryData, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post('/module-control/categories', categoryData)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return response.data
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to create category')
    }
  }
)

export const updateCategory = createAsyncThunk(
  'moduleControl/updateCategory',
  async ({ categoryId, categoryData }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.put(`/module-control/categories/${categoryId}`, categoryData)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return response.data
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update category')
    }
  }
)

export const deleteCategory = createAsyncThunk(
  'moduleControl/deleteCategory',
  async (categoryId, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.delete(`/module-control/categories/${categoryId}`)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return categoryId
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to delete category')
    }
  }
)

export const setDefaultCategory = createAsyncThunk(
  'moduleControl/setDefaultCategory',
  async (categoryId, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post(`/module-control/categories/${categoryId}/set-default`)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return response.data
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to set default category')
    }
  }
)

export const createSection = createAsyncThunk(
  'moduleControl/createSection',
  async (sectionData, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post('/module-control/sections', sectionData)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return response.data
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to create section')
    }
  }
)

export const updateSection = createAsyncThunk(
  'moduleControl/updateSection',
  async ({ sectionId, sectionData }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.put(`/module-control/sections/${sectionId}`, sectionData)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return response.data
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update section')
    }
  }
)

export const deleteSection = createAsyncThunk(
  'moduleControl/deleteSection',
  async (sectionId, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.delete(`/module-control/sections/${sectionId}`)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return sectionId
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to delete section')
    }
  }
)

export const createItem = createAsyncThunk(
  'moduleControl/createItem',
  async (itemData, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post('/module-control/items', itemData)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return response.data
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to create item')
    }
  }
)

export const updateItem = createAsyncThunk(
  'moduleControl/updateItem',
  async ({ itemId, itemData }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.put(`/module-control/items/${itemId}`, itemData)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return response.data
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to update item')
    }
  }
)

export const deleteItem = createAsyncThunk(
  'moduleControl/deleteItem',
  async (itemId, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.delete(`/module-control/items/${itemId}`)
      if (response.data.success) {
        dispatch(loadModuleStructure())
        return itemId
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to delete item')
    }
  }
)

export const exportStructure = createAsyncThunk(
  'moduleControl/exportStructure',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/module-control/export')
      if (response.data.success) {
        return response.data.structure
      }
      return rejectWithValue('Invalid response from server')
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Failed to export structure')
    }
  }
)

const initialState = {
  categories: [],
  sections: [],
  items: [],
  loading: false,
  error: null,
  structureLoaded: false,
  // Modal states
  showCategoryModal: false,
  showSectionModal: false,
  showItemModal: false,
  editingCategory: null,
  editingSection: null,
  editingItem: null,
  // Form data
  categoryForm: {
    name: '',
    label: '',
    icon: 'fas fa-cube',
    order_index: 0,
    is_active: true
  },
  sectionForm: {
    category_id: '',
    name: '',
    label: '',
    icon: '',
    order_index: 0,
    is_active: true
  },
  itemForm: {
    section_id: '',
    name: '',
    label: '',
    icon: '',
    command: '',
    execution_type: 'powershell',
    order_index: 0,
    is_active: true,
    requires_admin: false,
    description: ''
  },
  // UI state
  expandedCategories: {},
  expandedSections: {}
}

const moduleControlSlice = createSlice({
  name: 'moduleControl',
  initialState,
  reducers: {
    // UI state
    toggleCategory: (state, action) => {
      const categoryId = action.payload
      state.expandedCategories[categoryId] = !state.expandedCategories[categoryId]
    },
    toggleSection: (state, action) => {
      const sectionId = action.payload
      state.expandedSections[sectionId] = !state.expandedSections[sectionId]
    },
    // Category modal
    openCategoryModal: (state, action) => {
      const category = action.payload
      if (category) {
        state.editingCategory = category
        state.categoryForm = {
          name: category.name,
          label: category.label,
          icon: category.icon,
          order_index: category.order_index,
          is_active: Boolean(category.is_active)
        }
      } else {
        state.editingCategory = null
        state.categoryForm = {
          name: '',
          label: '',
          icon: 'fas fa-cube',
          order_index: state.categories.length,
          is_active: true
        }
      }
      state.showCategoryModal = true
    },
    closeCategoryModal: (state) => {
      state.showCategoryModal = false
      state.editingCategory = null
    },
    // Section modal
    openSectionModal: (state, action) => {
      const { section, categoryId } = action.payload
      if (section) {
        state.editingSection = section
        state.sectionForm = {
          category_id: section.category_id,
          name: section.name,
          label: section.label,
          icon: section.icon || '',
          order_index: section.order_index,
          is_active: Boolean(section.is_active)
        }
      } else {
        state.editingSection = null
        const catSections = state.sections.filter(s => s.category_id === categoryId)
        state.sectionForm = {
          category_id: categoryId,
          name: '',
          label: '',
          icon: '',
          order_index: catSections.length,
          is_active: true
        }
      }
      state.showSectionModal = true
    },
    closeSectionModal: (state) => {
      state.showSectionModal = false
      state.editingSection = null
    },
    // Item modal
    openItemModal: (state, action) => {
      const { item, sectionId } = action.payload
      if (item) {
        state.editingItem = item
        state.itemForm = {
          section_id: item.section_id,
          name: item.name,
          label: item.label,
          icon: item.icon || '',
          command: item.command,
          execution_type: item.execution_type || 'powershell',
          order_index: item.order_index,
          is_active: Boolean(item.is_active),
          requires_admin: Boolean(item.requires_admin),
          description: item.description || ''
        }
      } else {
        state.editingItem = null
        const secItems = state.items.filter(i => i.section_id === sectionId)
        state.itemForm = {
          section_id: sectionId,
          name: '',
          label: '',
          icon: '',
          command: '',
          execution_type: 'powershell',
          order_index: secItems.length,
          is_active: true,
          requires_admin: false,
          description: ''
        }
      }
      state.showItemModal = true
    },
    closeItemModal: (state) => {
      state.showItemModal = false
      state.editingItem = null
    },
    // Form updates
    updateCategoryForm: (state, action) => {
      state.categoryForm = { ...state.categoryForm, ...action.payload }
    },
    updateSectionForm: (state, action) => {
      state.sectionForm = { ...state.sectionForm, ...action.payload }
    },
    updateItemForm: (state, action) => {
      state.itemForm = { ...state.itemForm, ...action.payload }
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      // loadModuleStructure
      .addCase(loadModuleStructure.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadModuleStructure.fulfilled, (state, action) => {
        state.loading = false
        state.categories = action.payload.categories
        state.sections = action.payload.sections
        state.items = action.payload.items
        state.structureLoaded = true
      })
      .addCase(loadModuleStructure.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.structureLoaded = true
      })
      // createCategory, updateCategory, deleteCategory, setDefaultCategory
      .addCase(createCategory.pending, (state) => { state.loading = true; state.error = null })
      .addCase(createCategory.fulfilled, (state) => { state.loading = false })
      .addCase(createCategory.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(updateCategory.pending, (state) => { state.loading = true; state.error = null })
      .addCase(updateCategory.fulfilled, (state) => { state.loading = false })
      .addCase(updateCategory.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(deleteCategory.pending, (state) => { state.loading = true; state.error = null })
      .addCase(deleteCategory.fulfilled, (state) => { state.loading = false })
      .addCase(deleteCategory.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(setDefaultCategory.pending, (state) => { state.loading = true; state.error = null })
      .addCase(setDefaultCategory.fulfilled, (state) => { state.loading = false })
      .addCase(setDefaultCategory.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      // createSection, updateSection, deleteSection
      .addCase(createSection.pending, (state) => { state.loading = true; state.error = null })
      .addCase(createSection.fulfilled, (state) => { state.loading = false })
      .addCase(createSection.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(updateSection.pending, (state) => { state.loading = true; state.error = null })
      .addCase(updateSection.fulfilled, (state) => { state.loading = false })
      .addCase(updateSection.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(deleteSection.pending, (state) => { state.loading = true; state.error = null })
      .addCase(deleteSection.fulfilled, (state) => { state.loading = false })
      .addCase(deleteSection.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      // createItem, updateItem, deleteItem
      .addCase(createItem.pending, (state) => { state.loading = true; state.error = null })
      .addCase(createItem.fulfilled, (state) => { state.loading = false })
      .addCase(createItem.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(updateItem.pending, (state) => { state.loading = true; state.error = null })
      .addCase(updateItem.fulfilled, (state) => { state.loading = false })
      .addCase(updateItem.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      .addCase(deleteItem.pending, (state) => { state.loading = true; state.error = null })
      .addCase(deleteItem.fulfilled, (state) => { state.loading = false })
      .addCase(deleteItem.rejected, (state, action) => { state.loading = false; state.error = action.payload })
      // exportStructure
      .addCase(exportStructure.pending, (state) => { state.loading = true; state.error = null })
      .addCase(exportStructure.fulfilled, (state) => { state.loading = false })
      .addCase(exportStructure.rejected, (state, action) => { state.loading = false; state.error = action.payload })
  }
})

export const {
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
  updateItemForm,
  clearError
} = moduleControlSlice.actions

export default moduleControlSlice.reducer

