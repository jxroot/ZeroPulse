import { useSelector } from 'react-redux'
import TunnelTableRow from './TunnelTableRow'
import LoadingSpinner from '../common/LoadingSpinner'

const TunnelList = () => {
  const tunnels = useSelector(state => state.tunnels.tunnels)
  const loading = useSelector(state => state.tunnels.loading)
  const error = useSelector(state => state.tunnels.error)

  if (loading && tunnels.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner 
          message="Loading tunnels..."
        />
      </div>
    )
  }

  if (tunnels.length === 0 && !loading) {
    return (
      <div className="text-center py-8 px-4">
        <i className="fas fa-server text-4xl opacity-50 mb-3" style={{ color: 'var(--text-secondary)' }}></i>
        <h3 className="m-0 mb-2 text-lg" style={{ color: 'var(--text-primary)' }}>No tunnels found</h3>
        <p className="m-0 text-xs" style={{ color: 'var(--text-secondary)' }}>Your tunnels will be displayed here</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      {error && (
        <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm border border-red-500/30">
          Error: {error}
        </div>
      )}
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[800px]">
          <thead style={{ backgroundColor: 'var(--bg-quaternary)', borderBottomColor: 'var(--border-color)' }} className="border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Label</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>WinRM</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>SSH</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Origin IP</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody style={{ borderTopColor: 'var(--border-color)' }} className="divide-y">
            {tunnels.map((tunnel) => (
              <TunnelTableRow key={tunnel.id} tunnel={tunnel} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TunnelList
