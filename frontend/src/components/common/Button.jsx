const Button = ({ 
  type = 'button', 
  variant = 'primary', 
  disabled = false, 
  loading = false, 
  icon = '', 
  children,
  onClick,
  className = ''
}) => {
  const variantClasses = {
    primary: 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white',
    success: 'bg-[#28a745] text-white',
    danger: 'bg-[#dc3545] text-white',
    info: 'bg-[#17a2b8] text-white'
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        px-5 py-2.5 rounded-lg font-medium transition-all duration-300
        ${variantClasses[variant]}
        ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-lg'}
        flex items-center justify-center gap-2
        ${className}
      `}
    >
      {loading && <i className="fas fa-spinner fa-spin"></i>}
      {!loading && icon && <i className={icon}></i>}
      {children}
    </button>
  )
}

export default Button

