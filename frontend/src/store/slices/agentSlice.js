import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  isModalOpen: false
}

const agentSlice = createSlice({
  name: 'agent',
  initialState,
  reducers: {
    openModal: (state) => {
      state.isModalOpen = true
    },
    closeModal: (state) => {
      state.isModalOpen = false
    }
  }
})

export const { openModal, closeModal } = agentSlice.actions
export default agentSlice.reducer

