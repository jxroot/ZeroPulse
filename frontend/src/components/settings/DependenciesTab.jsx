import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadDependencies } from '../../store/slices/settingsSlice'
import LoadingSpinner from '../common/LoadingSpinner'

const DependenciesTab = () => {
  const dispatch = useDispatch()
  const settings = useSelector(state => state.settings)

  useEffect(() => {
    if (settings.dependencies.length === 0 && !settings.loading) {
      dispatch(loadDependencies())
    }
  }, [dispatch, settings.dependencies.length, settings.loading])

  const handleRefresh = () => {
    dispatch(loadDependencies())
  }

  if (settings.loading && settings.dependencies.length === 0) {
    return (
      <div className="text-center py-10">
        <LoadingSpinner message="Checking dependencies..." />
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>System Dependencies</h4>
        <button
          onClick={handleRefresh}
          disabled={settings.loading}
          className="w-9 h-9 flex items-center justify-center bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          title="Refresh"
        >
          <i className={`fas fa-sync-alt ${settings.loading ? 'fa-spin' : ''}`}></i>
        </button>
      </div>

      <div className="space-y-4">
        {settings.dependencies.map((dep) => (
          <div
            key={dep.name}
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--bg-quaternary)', border: '1px solid var(--border-color)' }}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                  dep.installed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  <i className={`fas ${dep.installed ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                </div>
                <div className="flex-1">
                  <h5 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{dep.name}</h5>
                  {dep.description && (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{dep.description}</p>
                  )}
                  {dep.installed && dep.version && (
                    <div className="text-xs text-green-400 mt-1">
                      Version: {dep.version}
                    </div>
                  )}
                  {dep.installed && dep.path && (
                    <div className="text-xs mt-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
                      Path: {dep.path}
                    </div>
                  )}
                  {!dep.installed && dep.install_command && (
                    <div className="text-xs text-red-400 mt-2">
                      <strong>Install:</strong> <code className="px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>{dep.install_command}</code>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  dep.installed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {dep.installed ? 'Installed' : 'Not Installed'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {settings.dependenciesError && (
        <div className="mt-4 bg-red-500/20 text-red-400 p-4 rounded-lg border border-red-500/30">
          Error: {settings.dependenciesError}
        </div>
      )}
    </>
  )
}

export default DependenciesTab

