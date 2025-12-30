import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setActiveTab, loadModules, loadDependencies } from '../store/slices/settingsSlice'
// Permission checks removed for single user system
import MainLayout from '../components/Layout/MainLayout'
import ModulesTab from '../components/settings/ModulesTab'
import DependenciesTab from '../components/settings/DependenciesTab'
import SystemLogTab from '../components/settings/SystemLogTab'
import ActiveSessionsTab from '../components/settings/ActiveSessionsTab'
import ApiTab from '../components/settings/ApiTab'
import RoutesTab from '../components/settings/RoutesTab'
import ModuleControlTab from '../components/settings/ModuleControlTab'
import ProfileTab from '../components/settings/ProfileTab'
import CloudflareTab from '../components/settings/CloudflareTab'
import LocalShellTab from '../components/settings/LocalShellTab'

const Settings = () => {
  const dispatch = useDispatch()
  const activeTab = useSelector(state => state.settings.activeTab)
  const permissions = useSelector(state => state.auth.permissions)

  // Check permissions for each tab
  const tabs = [
    { id: 'modules', label: 'Modules', icon: 'fas fa-cube', permission: 'settings:modules:view' },
    { id: 'dependencies', label: 'Dependencies', icon: 'fas fa-link', permission: 'settings:dependencies:view' },
    { id: 'system_log', label: 'System Log', icon: 'fas fa-file-alt', permission: 'settings:system_log:view' },
    { id: 'active_sessions', label: 'Active Sessions', icon: 'fas fa-users', permission: 'settings:sessions:view' },
    { id: 'api', label: 'API', icon: 'fas fa-code', permission: 'settings:api:view' },
    { id: 'routes', label: 'Routes', icon: 'fas fa-route', permission: 'settings:routes:view' },
    { id: 'module_control', label: 'Module Control', icon: 'fas fa-th-large', permission: 'settings:module_control:view' },
    { id: 'local_shell', label: 'Local Shell', icon: 'fas fa-terminal', permission: null },
    { id: 'profile', label: 'Profile', icon: 'fas fa-user', permission: null },
    { id: 'cloudflare', label: 'Cloudflare Account', icon: 'fas fa-cloud', permission: 'settings:manage' }
  ].filter(tab => {
    // Single user system - show all tabs (no permission check needed)
    return true
  })

  useEffect(() => {
    // Load modules when switching to Modules tab
    if (activeTab === 'modules') {
      dispatch(loadModules())
    }
    // Load dependencies when switching to Dependencies tab
    if (activeTab === 'dependencies') {
      dispatch(loadDependencies())
    }
  }, [activeTab, dispatch])

  const handleTabChange = (tabId) => {
    dispatch(setActiveTab(tabId))
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'modules':
        return <ModulesTab />
      case 'dependencies':
        return <DependenciesTab />
      case 'system_log':
        return <SystemLogTab />
      case 'active_sessions':
        return <ActiveSessionsTab />
      case 'api':
        return <ApiTab />
      case 'routes':
        return <RoutesTab />
      case 'module_control':
        return <ModuleControlTab />
      case 'local_shell':
        return <LocalShellTab />
      case 'profile':
        return <ProfileTab />
      case 'cloudflare':
        return <CloudflareTab />
      default:
        return <ModulesTab />
    }
  }

  // Single user system - no permission check needed

  return (
    <MainLayout title="Settings">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex border-b-2 overflow-x-auto scrollbar-thin" style={{ borderColor: 'var(--border-color)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'text-purple-400 border-purple-400'
                  : 'border-transparent'
              }`}
              style={activeTab === tab.id ? {} : {
                color: 'var(--text-secondary)',
                borderColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = 'var(--text-primary)'
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                  e.currentTarget.style.borderColor = 'transparent'
                }
              }}
            >
              <i className={`${tab.icon} mr-2`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="card p-6">
          {renderTabContent()}
        </div>
      </div>
    </MainLayout>
  )
}

export default Settings

