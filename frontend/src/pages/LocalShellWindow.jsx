import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { initTheme } from '../store/slices/themeSlice'
import LocalShellTab from '../components/settings/LocalShellTab'

const LocalShellWindow = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(initTheme())
  }, [dispatch])

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="h-full w-full p-6 overflow-auto">
        <LocalShellTab />
      </div>
    </div>
  )
}

export default LocalShellWindow

