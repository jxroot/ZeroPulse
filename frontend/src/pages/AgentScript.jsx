import MainLayout from '../components/Layout/MainLayout'
import AgentEditor from '../components/agent/AgentEditor'

const AgentScript = () => {
  return (
    <MainLayout title="Agent Script">
      <div className="space-y-6">
        {/* Agent Section */}
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Agent Script Editor</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Configure and customize agent deployment scripts</p>
          </div>
          <div className="w-full min-h-[200px]">
            <AgentEditor />
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

export default AgentScript

