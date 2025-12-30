import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../../store/slices/authSlice'
import { showConfirm } from '../../store/slices/alertSlice'

const Sidebar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const auth = useSelector(state => state.auth)

  const menuItems = [
    { id: 'agents', label: 'Agents', icon: 'fas fa-laptop-code', path: '/agents', color: 'text-blue-400' },
    { id: 'tunnels', label: 'Route Proxies', icon: 'fas fa-network-wired', path: '/tunnels', color: 'text-cyan-400' },
    { id: 'history', label: 'Command History', icon: 'fas fa-history', path: '/history', color: 'text-orange-400' },
    { id: 'agent-script', label: 'Agent Script', icon: 'fas fa-code', path: '/AgentScript', color: 'text-red-400' },
    { id: 'settings', label: 'Settings', icon: 'fas fa-cog', path: '/settings', color: 'text-gray-400' },
    { id: 'about', label: 'About', icon: 'fas fa-info-circle', path: '/about', color: 'text-purple-400' }
  ]

  const isActive = (path) => {
    return location.pathname.startsWith(path)
  }

  const handleLogout = () => {
    dispatch(showConfirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
      onConfirm: () => {
        dispatch(logout())
        navigate('/login')
      },
      onCancel: () => {
        // Modal will close automatically
      }
    }))
  }

  return (
    <div className="w-64 border-r flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
      <div className="p-4 flex items-center space-x-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center">
          <i className="fas fa-terminal text-white text-lg"></i>
        </div>
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>ZeroPulse</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>v0.1</p>
        </div>
      </div>
      
      <div className="p-4 space-y-1 flex-1 overflow-y-auto scrollbar-thin">
        {menuItems.map((item) => (
          <div
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`sidebar-item flex items-center space-x-3 p-3 rounded-lg cursor-pointer ${
              isActive(item.path) ? 'active' : ''
            }`}
          >
            <i className={`${item.icon} ${item.color}`}></i>
            <span style={{ color: 'var(--text-primary)' }}>{item.label}</span>
          </div>
        ))}
      </div>
      
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <i className="fas fa-user" style={{ color: 'var(--text-secondary)' }}></i>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {auth.user?.username || 'User'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {auth.user?.role_name || 'User'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ 
              backgroundColor: 'transparent', 
              color: 'var(--text-secondary)' 
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            title="Logout"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Sidebar

