import { useEffect } from 'react'
import { useSelector } from 'react-redux'

const AboutTab = () => {
  const theme = useSelector(state => state.theme.theme)
  const isLightMode = theme === 'light'
  
  useEffect(() => {
    // Any initialization if needed
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] mb-3 shadow-lg">
          <i className="fas fa-code text-3xl text-white"></i>
        </div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          ZeroPulse C2 Server
        </h2>
        <p className="text-base mb-3" style={{ color: 'var(--text-secondary)' }}>
          A Modern Command & Control Platform
        </p>
        {/* Version Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#667eea]/20 border border-[#667eea]/50 rounded-full mb-3">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Version v0.1
          </span>
          <span 
            className="px-2 py-0.5 text-xs font-medium rounded-full"
            style={{
              backgroundColor: isLightMode ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.2)',
              color: isLightMode ? '#ca8a04' : '#fbbf24'
            }}
          >
            TESTING
          </span>
        </div>
        {/* Warning Banner */}
        <div 
          className="mx-auto max-w-2xl border rounded-lg p-3"
          style={{
            backgroundColor: isLightMode ? 'rgba(234, 179, 8, 0.08)' : 'rgba(234, 179, 8, 0.1)',
            borderColor: isLightMode ? 'rgba(234, 179, 8, 0.25)' : 'rgba(234, 179, 8, 0.3)'
          }}
        >
          <div className="flex items-start gap-3">
            <i 
              className="fas fa-exclamation-triangle text-base mt-0.5"
              style={{ color: isLightMode ? '#ca8a04' : '#fbbf24' }}
            ></i>
            <div className="text-left">
              <p 
                className="text-xs font-semibold mb-1"
                style={{ color: isLightMode ? '#ca8a04' : '#fbbf24' }}
              >
                Testing Version - May Contain Bugs
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                This is a testing version (v0.1) and may contain bugs or unstable features. 
                Use at your own risk. For production use, please wait for a stable release.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Info Card */}
      <div className="bg-gradient-to-br from-[#667eea]/20 to-[#764ba2]/20 border border-[#667eea]/30 rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center shadow-md">
            <i className="fas fa-user text-2xl text-white"></i>
          </div>
          <div>
            <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              HamidReza Mohseniyan
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Project Developer & Maintainer
            </p>
          </div>
        </div>

        <div className="space-y-3 mt-6">
          <a
            href="https://github.com/jxroot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 border rounded-lg transition-all group cursor-pointer"
            style={{
              backgroundColor: isLightMode ? '#f8f9fa' : '#1a1a2e',
              borderColor: isLightMode ? '#dee2e6' : '#3a3a4e'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isLightMode ? '#dee2e6' : '#3a3a4e'
            }}
          >
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
              style={{
                backgroundColor: isLightMode ? '#24292e' : '#24292e'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#24292e'
              }}
            >
              <i className="fab fa-github text-xl text-white"></i>
            </div>
            <div className="flex-1">
              <p 
                className="text-sm font-semibold transition-colors" 
                style={{ color: 'var(--text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--accent-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
              >
                GitHub
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                github.com/jxroot
              </p>
            </div>
            <i 
              className="fas fa-external-link-alt text-sm transition-colors" 
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            ></i>
          </a>
        </div>
      </div>

      {/* Project Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Version Card */}
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[#667eea]/20 flex items-center justify-center">
              <i className="fas fa-tag text-[#667eea]"></i>
            </div>
            <div>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Version
              </h4>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  v0.1
                </p>
                <span 
                  className="px-2 py-0.5 text-xs rounded-full"
                  style={{
                    backgroundColor: isLightMode ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.2)',
                    color: isLightMode ? '#ca8a04' : '#fbbf24'
                  }}
                >
                  Testing
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* License Card */}
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[#764ba2]/20 flex items-center justify-center">
              <i className="fas fa-balance-scale text-[#764ba2]"></i>
            </div>
            <div>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                License
              </h4>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                MIT License
              </p>
            </div>
          </div>
        </div>

        {/* Technology Stack */}
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[#667eea]/20 flex items-center justify-center">
              <i className="fas fa-layer-group text-[#667eea]"></i>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Technology Stack
              </h4>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-[#667eea]/10 text-[#667eea] text-xs rounded">React</span>
                <span className="px-2 py-1 bg-[#667eea]/10 text-[#667eea] text-xs rounded">FastAPI</span>
                <span className="px-2 py-1 bg-[#667eea]/10 text-[#667eea] text-xs rounded">SQLite</span>
                <span className="px-2 py-1 bg-[#667eea]/10 text-[#667eea] text-xs rounded">WebSocket</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[#764ba2]/20 flex items-center justify-center">
              <i className="fas fa-star text-[#764ba2]"></i>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Key Features
              </h4>
              <div className="space-y-1">
                <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <i className="fas fa-check text-green-400"></i>
                  Cloudflare Tunnel Management
                </p>
                <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <i className="fas fa-check text-green-400"></i>
                  Interactive Shell (evil-winrm)
                </p>
                <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <i className="fas fa-check text-green-400"></i>
                  Performance Optimized
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-6">
        <h4 className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <i className="fas fa-info-circle text-[#667eea]"></i>
          About ZeroPulse
        </h4>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          ZeroPulse is a comprehensive Command & Control (C2) platform designed for secure remote management 
          and monitoring. It leverages Cloudflare Tunnel technology to provide secure, encrypted connections 
          without exposing your infrastructure to the public internet. Built with modern technologies and 
          optimized for performance, ZeroPulse offers a powerful yet user-friendly interface for managing 
          remote systems, executing commands, and monitoring infrastructure.
        </p>
      </div>

      {/* Footer */}
      <div className="text-center pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Made with <i className="fas fa-heart text-red-400 mx-1"></i> by HamidReza Mohseniyan
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
          © {new Date().getFullYear()} ZeroPulse. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default AboutTab

