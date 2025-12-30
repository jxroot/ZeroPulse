const LoadingSpinner = ({ message = 'Loading...', subtitle = '' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-5">
      <div 
        className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-5"
        style={{
          borderColor: 'var(--bg-tertiary)',
          borderTopColor: 'var(--accent-primary)'
        }}
      ></div>
      {message && (
        <h3 className="m-0 mb-2.5" style={{ color: 'var(--text-primary)', opacity: 0.9 }}>{message}</h3>
      )}
      {subtitle && (
        <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>{subtitle}</p>
      )}
    </div>
  )
}

export default LoadingSpinner

