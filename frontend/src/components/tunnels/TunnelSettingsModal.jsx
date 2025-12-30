import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { createPortal } from 'react-dom'
import {
  loadGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  loadRules,
  createRule,
  updateRule,
  deleteRule,
  clearError
} from '../../store/slices/tunnelGroupsSlice'
import { loadTunnels } from '../../store/slices/tunnelsSlice'
import { confirm } from '../../utils/alert'

const TunnelSettingsModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch()
  const theme = useSelector(state => state.theme.theme)
  const tunnelGroups = useSelector(state => state.tunnelGroups)
  const isLightMode = theme === 'light'
  
  const [activeTab, setActiveTab] = useState('groups')
  
  // Settings state
  const [hideUngrouped, setHideUngrouped] = useState(() => {
    const saved = localStorage.getItem('tunnelSettings_hideUngrouped')
    return saved !== null ? saved === 'true' : false
  })
  const [hideOffline, setHideOffline] = useState(() => {
    const saved = localStorage.getItem('tunnelSettings_hideOffline')
    return saved !== null ? saved === 'true' : false
  })
  const [hideInactive, setHideInactive] = useState(() => {
    const saved = localStorage.getItem('tunnelSettings_hideInactive')
    return saved !== null ? saved === 'true' : false
  })
  
  // Groups state
  const [editingGroup, setEditingGroup] = useState(null)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupForm, setGroupForm] = useState({ name: '', color: '#667eea', order_index: 0 })
  const [groupError, setGroupError] = useState(null)
  const [groupSuccess, setGroupSuccess] = useState(null)
  
  // Rules state
  const [editingRule, setEditingRule] = useState(null)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState({ group_id: '', pattern: '', pattern_type: 'prefix', order_index: 0 })
  const [ruleError, setRuleError] = useState(null)
  const [ruleSuccess, setRuleSuccess] = useState(null)

  useEffect(() => {
    if (isOpen) {
      dispatch(loadGroups())
      dispatch(loadRules())
      // Clear messages when modal opens
      setGroupError(null)
      setGroupSuccess(null)
      setRuleError(null)
      setRuleSuccess(null)
    }
  }, [isOpen, dispatch])

  // Clear success messages after 3 seconds
  useEffect(() => {
    if (groupSuccess) {
      const timer = setTimeout(() => setGroupSuccess(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [groupSuccess])

  useEffect(() => {
    if (ruleSuccess) {
      const timer = setTimeout(() => setRuleSuccess(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [ruleSuccess])

  // Save settings to localStorage and dispatch custom event
  useEffect(() => {
    localStorage.setItem('tunnelSettings_hideUngrouped', hideUngrouped.toString())
    window.dispatchEvent(new CustomEvent('tunnelSettingsChanged', { 
      detail: { key: 'hideUngrouped', value: hideUngrouped } 
    }))
  }, [hideUngrouped])

  useEffect(() => {
    localStorage.setItem('tunnelSettings_hideOffline', hideOffline.toString())
    window.dispatchEvent(new CustomEvent('tunnelSettingsChanged', { 
      detail: { key: 'hideOffline', value: hideOffline } 
    }))
  }, [hideOffline])

  useEffect(() => {
    localStorage.setItem('tunnelSettings_hideInactive', hideInactive.toString())
    window.dispatchEvent(new CustomEvent('tunnelSettingsChanged', { 
      detail: { key: 'hideInactive', value: hideInactive } 
    }))
  }, [hideInactive])

  useEffect(() => {
    if (tunnelGroups.groups.length > 0 && !ruleForm.group_id) {
      setRuleForm(prev => ({ ...prev, group_id: tunnelGroups.groups[0].id }))
    }
  }, [tunnelGroups.groups])

  const handleCreateGroup = async () => {
    if (!groupForm.name.trim()) {
      setGroupError('Group name is required')
      return
    }
    setGroupError(null)
    setGroupSuccess(null)
    try {
      await dispatch(createGroup(groupForm)).unwrap()
      setGroupForm({ name: '', color: '#667eea', order_index: 0 })
      setShowGroupForm(false)
      await dispatch(loadGroups()) // Reload groups list
      await dispatch(loadTunnels(true))
      setGroupSuccess('Group created successfully')
    } catch (err) {
      setGroupError(err || 'Failed to create group')
    }
  }

  const handleUpdateGroup = async () => {
    if (!editingGroup) return
    if (!groupForm.name.trim()) {
      setGroupError('Group name is required')
      return
    }
    setGroupError(null)
    setGroupSuccess(null)
    try {
      await dispatch(updateGroup({ groupId: editingGroup.id, groupData: groupForm })).unwrap()
      setEditingGroup(null)
      setShowGroupForm(false)
      setGroupForm({ name: '', color: '#667eea', order_index: 0 })
      await dispatch(loadGroups()) // Reload groups list
      await dispatch(loadTunnels(true))
      setGroupSuccess('Group updated successfully')
    } catch (err) {
      setGroupError(err || 'Failed to update group')
    }
  }

  const handleDeleteGroup = async (groupId) => {
    const confirmed = await confirm(
      'Are you sure you want to delete this group? All associated rules will also be deleted.',
      'Delete Group'
    )
    if (!confirmed) return

    setGroupError(null)
    setGroupSuccess(null)
    try {
      await dispatch(deleteGroup(groupId)).unwrap()
      await dispatch(loadGroups()) // Reload groups list
      await dispatch(loadRules()) // Reload rules list
      await dispatch(loadTunnels(true))
      setGroupSuccess('Group deleted successfully')
    } catch (err) {
      setGroupError(err || 'Failed to delete group')
    }
  }

  const handleEditGroup = (group) => {
    setEditingGroup(group)
    setShowGroupForm(true)
    setGroupForm({
      name: group.name,
      color: group.color || '#667eea',
      order_index: group.order_index || 0
    })
  }

  const handleCancelGroupForm = () => {
    setEditingGroup(null)
    setShowGroupForm(false)
    setGroupForm({ name: '', color: '#667eea', order_index: 0 })
    setGroupError(null)
    setGroupSuccess(null)
  }

  const handleShowGroupForm = () => {
    setEditingGroup(null)
    setShowGroupForm(true)
    setGroupForm({ name: '', color: '#667eea', order_index: 0 })
    setGroupError(null)
    setGroupSuccess(null)
  }

  const handleCreateRule = async () => {
    if (!ruleForm.group_id || !ruleForm.pattern.trim()) {
      setRuleError('Group and pattern are required')
      return
    }
    setRuleError(null)
    setRuleSuccess(null)
    try {
      await dispatch(createRule(ruleForm)).unwrap()
      setRuleForm({ group_id: tunnelGroups.groups[0]?.id || '', pattern: '', pattern_type: 'prefix', order_index: 0 })
      setShowRuleForm(false)
      await dispatch(loadRules()) // Reload rules list
      await dispatch(loadTunnels(true))
      setRuleSuccess('Rule created successfully')
    } catch (err) {
      setRuleError(err || 'Failed to create rule')
    }
  }

  const handleUpdateRule = async () => {
    if (!editingRule) return
    if (!ruleForm.group_id || !ruleForm.pattern.trim()) {
      setRuleError('Group and pattern are required')
      return
    }
    setRuleError(null)
    setRuleSuccess(null)
    try {
      await dispatch(updateRule({ ruleId: editingRule.id, ruleData: ruleForm })).unwrap()
      setEditingRule(null)
      setShowRuleForm(false)
      setRuleForm({ group_id: tunnelGroups.groups[0]?.id || '', pattern: '', pattern_type: 'prefix', order_index: 0 })
      await dispatch(loadRules()) // Reload rules list
      await dispatch(loadTunnels(true))
      setRuleSuccess('Rule updated successfully')
    } catch (err) {
      setRuleError(err || 'Failed to update rule')
    }
  }

  const handleDeleteRule = async (ruleId) => {
    const confirmed = await confirm(
      'Are you sure you want to delete this rule?',
      'Delete Rule'
    )
    if (!confirmed) return

    setRuleError(null)
    setRuleSuccess(null)
    try {
      await dispatch(deleteRule(ruleId)).unwrap()
      await dispatch(loadRules()) // Reload rules list
      await dispatch(loadTunnels(true))
      setRuleSuccess('Rule deleted successfully')
    } catch (err) {
      setRuleError(err || 'Failed to delete rule')
    }
  }

  const handleEditRule = (rule) => {
    setEditingRule(rule)
    setShowRuleForm(true)
    setRuleForm({
      group_id: rule.group_id,
      pattern: rule.pattern,
      pattern_type: rule.pattern_type || 'prefix',
      order_index: rule.order_index || 0
    })
  }

  const handleCancelRuleForm = () => {
    setEditingRule(null)
    setShowRuleForm(false)
    setRuleForm({ group_id: tunnelGroups.groups[0]?.id || '', pattern: '', pattern_type: 'prefix', order_index: 0 })
    setRuleError(null)
    setRuleSuccess(null)
  }

  const handleShowRuleForm = () => {
    setEditingRule(null)
    setShowRuleForm(true)
    setRuleForm({ group_id: tunnelGroups.groups[0]?.id || '', pattern: '', pattern_type: 'prefix', order_index: 0 })
    setRuleError(null)
    setRuleSuccess(null)
  }

  if (!isOpen) return null

  const modalContent = (
    <div 
      className="fixed z-[1001] left-0 top-0 w-full h-full backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: isLightMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)' }}
      onClick={onClose}
    >
      <div 
        className="rounded-xl w-full shadow-2xl border overflow-hidden my-4"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: 'var(--border-color)',
          maxWidth: '800px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Tunnel Settings
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-opacity-20 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
          {['settings', 'groups', 'rules'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2'
                  : 'hover:bg-opacity-10'
              }`}
              style={{
                color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottomColor: activeTab === tab ? 'var(--accent-primary)' : 'transparent',
                backgroundColor: activeTab === tab ? 'transparent' : 'transparent'
              }}
            >
              {tab === 'settings' ? 'Settings' : tab === 'groups' ? 'Groups' : 'Group Rules'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'settings' ? (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Display Settings
              </h3>
              
              {/* Hide Ungrouped Tunnels */}
              <div className="flex items-center justify-between p-4 rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-quaternary)' }}>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Hide Ungrouped Tunnels
                  </label>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Hide tunnels that are not assigned to any group
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideUngrouped}
                    onChange={(e) => setHideUngrouped(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 bg-gray-600"></div>
                </label>
              </div>

              {/* Hide Offline Tunnels */}
              <div className="flex items-center justify-between p-4 rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-quaternary)' }}>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Hide Offline Tunnels
                  </label>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Hide tunnels that are currently offline or down
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideOffline}
                    onChange={(e) => setHideOffline(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 bg-gray-600"></div>
                </label>
              </div>

              {/* Hide Inactive Tunnels */}
              <div className="flex items-center justify-between p-4 rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-quaternary)' }}>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Hide Inactive Tunnels
                  </label>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Hide tunnels that are currently inactive
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideInactive}
                    onChange={(e) => setHideInactive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 bg-gray-600"></div>
                </label>
              </div>
            </div>
          ) : activeTab === 'groups' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Groups
                </h3>
                {!showGroupForm && (
                  <button
                    onClick={handleShowGroupForm}
                    className="px-4 py-2 rounded-lg text-white text-sm"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <i className="fas fa-plus mr-2"></i>New Group
                  </button>
                )}
              </div>

              {/* Group Form */}
              {showGroupForm && (
                <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-quaternary)' }}>
                  <h4 className="font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                    {editingGroup ? 'Edit Group' : 'Create Group'}
                  </h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Group Name"
                      value={groupForm.name}
                      onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <div className="flex gap-3">
                      <input
                        type="color"
                        value={groupForm.color}
                        onChange={(e) => setGroupForm({ ...groupForm, color: e.target.value })}
                        className="h-10 w-20 rounded border"
                        style={{ borderColor: 'var(--border-color)' }}
                      />
                      <input
                        type="number"
                        placeholder="Order"
                        value={groupForm.order_index}
                        onChange={(e) => setGroupForm({ ...groupForm, order_index: parseInt(e.target.value) || 0 })}
                        className="flex-1 px-3 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                        className="px-4 py-2 rounded-lg text-white text-sm"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        {editingGroup ? 'Update' : 'Create'}
                      </button>
                      <button
                        onClick={handleCancelGroupForm}
                        className="px-4 py-2 rounded-lg border text-sm"
                        style={{
                          backgroundColor: 'var(--bg-quaternary)',
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {groupError && (
                <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm border border-red-500/30">
                  <i className="fas fa-exclamation-circle mr-2"></i>
                  {groupError}
                </div>
              )}

              {/* Success Message */}
              {groupSuccess && (
                <div className="bg-green-500/20 text-green-400 p-3 rounded-lg text-sm border border-green-500/30">
                  <i className="fas fa-check-circle mr-2"></i>
                  {groupSuccess}
                </div>
              )}

              {/* Groups List */}
              {!showGroupForm && tunnelGroups.groups.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <i className="fas fa-layer-group text-4xl opacity-50 mb-3" style={{ color: 'var(--text-secondary)' }}></i>
                  <h3 className="m-0 mb-2 text-lg" style={{ color: 'var(--text-primary)' }}>No groups found</h3>
                  <p className="m-0 text-xs" style={{ color: 'var(--text-secondary)' }}>Create a group to organize your tunnels</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tunnelGroups.groups.map((group) => (
                    <div
                      key={group.id}
                      className="p-4 rounded-lg border flex items-center justify-between"
                      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-quaternary)' }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: group.color || '#667eea' }}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>{group.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditGroup(group)}
                          className="px-3 py-1 rounded text-sm"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="px-3 py-1 rounded text-sm"
                          style={{ color: 'var(--text-danger)' }}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Group Rules
                </h3>
                {!showRuleForm && (
                  <button
                    onClick={handleShowRuleForm}
                    className="px-4 py-2 rounded-lg text-white text-sm"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <i className="fas fa-plus mr-2"></i>New Rule
                  </button>
                )}
              </div>

              {/* Rule Form */}
              {showRuleForm && (
                <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-quaternary)' }}>
                  <h4 className="font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                    {editingRule ? 'Edit Rule' : 'Create Rule'}
                  </h4>
                  <div className="space-y-3">
                    <select
                      value={ruleForm.group_id}
                      onChange={(e) => setRuleForm({ ...ruleForm, group_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <option value="">Select Group</option>
                      {tunnelGroups.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Pattern (e.g., tunnel- or ^tunnel-.*)"
                      value={ruleForm.pattern}
                      onChange={(e) => setRuleForm({ ...ruleForm, pattern: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <select
                      value={ruleForm.pattern_type}
                      onChange={(e) => setRuleForm({ ...ruleForm, pattern_type: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <option value="prefix">Prefix</option>
                      <option value="regex">Regex</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Order"
                      value={ruleForm.order_index}
                      onChange={(e) => setRuleForm({ ...ruleForm, order_index: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={editingRule ? handleUpdateRule : handleCreateRule}
                        className="px-4 py-2 rounded-lg text-white text-sm"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        {editingRule ? 'Update' : 'Create'}
                      </button>
                      <button
                        onClick={handleCancelRuleForm}
                        className="px-4 py-2 rounded-lg border text-sm"
                        style={{
                          backgroundColor: 'var(--bg-quaternary)',
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {ruleError && (
                <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm border border-red-500/30">
                  <i className="fas fa-exclamation-circle mr-2"></i>
                  {ruleError}
                </div>
              )}

              {/* Success Message */}
              {ruleSuccess && (
                <div className="bg-green-500/20 text-green-400 p-3 rounded-lg text-sm border border-green-500/30">
                  <i className="fas fa-check-circle mr-2"></i>
                  {ruleSuccess}
                </div>
              )}

              {/* Rules List */}
              {!showRuleForm && tunnelGroups.rules.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <i className="fas fa-list-ul text-4xl opacity-50 mb-3" style={{ color: 'var(--text-secondary)' }}></i>
                  <h3 className="m-0 mb-2 text-lg" style={{ color: 'var(--text-primary)' }}>No rules found</h3>
                  <p className="m-0 text-xs" style={{ color: 'var(--text-secondary)' }}>Create a rule to assign tunnels to groups</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tunnelGroups.rules.map((rule) => {
                    const group = tunnelGroups.groups.find(g => g.id === rule.group_id)
                    return (
                      <div
                        key={rule.id}
                        className="p-4 rounded-lg border flex items-center justify-between"
                        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-quaternary)' }}
                      >
                        <div className="flex items-center gap-3">
                          {group && (
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: group.color || '#667eea' }}
                            />
                          )}
                          <div>
                            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {group?.name || 'Unknown Group'}
                            </span>
                            <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {rule.pattern} ({rule.pattern_type})
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditRule(rule)}
                            className="px-3 py-1 rounded text-sm"
                            style={{ color: 'var(--accent-primary)' }}
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="px-3 py-1 rounded text-sm"
                            style={{ color: 'var(--text-danger)' }}
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default TunnelSettingsModal

