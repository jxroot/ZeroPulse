import { useSelector, useDispatch } from 'react-redux'
import { toggleTheme } from '../../store/slices/themeSlice'

const TopBar = ({ title, onNewAgent }) => {
  const dispatch = useDispatch()
  const tunnels = useSelector(state => state.tunnels)
  const theme = useSelector(state => state.theme.theme)
  const healthyTunnels = tunnels.tunnels.filter(t => t.status === 'healthy')
  const totalTunnels = tunnels.tunnels.length

  const handleToggleTheme = () => {
    dispatch(toggleTheme())
  }

  return (
    <div className="border-b p-4 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{title || 'Agents'}</h1>
        <div className="flex items-center space-x-2 text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Connected:</span>
          <span className="text-green-400 font-medium">{healthyTunnels.length}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Total:</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{totalTunnels}</span>
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <button
          onClick={handleToggleTheme}
          className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors"
          style={{ 
            backgroundColor: 'var(--bg-secondary)', 
            color: 'var(--text-secondary)' 
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <i className="fas fa-sun text-lg"></i>
          ) : (
            <i className="fas fa-moon text-lg"></i>
          )}
        </button>
        {onNewAgent && (
          <button
            onClick={onNewAgent}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <i className="fas fa-plus mr-2"></i> New Agent
          </button>
        )}
      </div>
    </div>
  )
}

export default TopBar

