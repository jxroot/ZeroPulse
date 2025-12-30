import Sidebar from './Sidebar'
import TopBar from './TopBar'

const MainLayout = ({ children, title, onNewAgent }) => {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title={title} onNewAgent={onNewAgent} />
        <div className="flex-1 overflow-auto p-6 space-y-6 scrollbar-thin" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default MainLayout

