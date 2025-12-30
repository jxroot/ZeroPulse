import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  theme: localStorage.getItem('theme') || 'dark'
}

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme: (state, action) => {
      state.theme = action.payload
      document.documentElement.setAttribute('data-theme', action.payload)
      localStorage.setItem('theme', action.payload)
    },
    toggleTheme: (state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark'
      state.theme = newTheme
      document.documentElement.setAttribute('data-theme', newTheme)
      localStorage.setItem('theme', newTheme)
    },
    initTheme: (state) => {
      document.documentElement.setAttribute('data-theme', state.theme)
    }
  }
})

export const { setTheme, toggleTheme, initTheme } = themeSlice.actions
export default themeSlice.reducer

