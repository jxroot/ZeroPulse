import { createPortal } from 'react-dom'

const NewTokenDisplayModal = ({ token, onClose, onCopy }) => {
  const modalContent = (
    <div className="fixed z-[1002] left-0 top-0 w-full h-full bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#2b2b40] rounded-xl w-full max-w-[700px] shadow-2xl border border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-green-400 text-white p-5 flex justify-between items-center">
          <h3 className="m-0 text-xl font-semibold">Token Created Successfully</h3>
          <button
            onClick={onClose}
            className="text-white text-2xl font-bold cursor-pointer transition-transform duration-200 hover:scale-125"
          >
            &times;
          </button>
        </div>
        <div className="p-6 bg-[#2b2b40]">
          <div className="mb-4 p-3 bg-red-500 text-white rounded-lg text-sm">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            Save this token now! You won't be able to see it again.
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-medium text-white">Your API Token:</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={token}
                readOnly
                className="flex-1 p-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm"
              />
              <button
                onClick={() => onCopy(token)}
                className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            I've Saved It
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default NewTokenDisplayModal

