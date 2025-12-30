import MainLayout from '../components/Layout/MainLayout'
import AgentEditor from '../components/agent/AgentEditor'

const Analytics = () => {
  return (
    <MainLayout title="Analytics">
      <div className="space-y-6">
        {/* Agent Section */}
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-white mb-2">Agent Script Editor</h2>
            <p className="text-gray-400">Configure and customize agent deployment scripts</p>
          </div>
          <div className="w-full min-h-[200px]">
            <AgentEditor />
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

export default Analytics

