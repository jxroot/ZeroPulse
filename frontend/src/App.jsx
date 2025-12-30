import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Outlet } from 'react-router-dom'
import { initTheme } from './store/slices/themeSlice'
import AlertModal from './components/common/AlertModal'
import ModuleModalDynamic from './components/modals/ModuleModalDynamic'
import RoutesModal from './components/modals/RoutesModal'

function App() {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(initTheme())
  }, [dispatch])

  return (
    <div className="h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Outlet />
      <AlertModal />
      <ModuleModalDynamic />
      <RoutesModal />
    </div>
  )
}

export default App
